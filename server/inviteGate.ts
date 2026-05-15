import { randomBytes } from 'node:crypto'

import type express from 'express'

import {
  DEFAULT_INVITE_CODE,
  DEFAULT_INVITE_SESSION_TTL_SECONDS,
  INVITE_COOKIE_NAME,
  constantTimeEqual,
  createInviteSessionToken,
  hashInviteCode,
  isValidInviteSessionToken,
} from './inviteSession'

const DEFAULT_MAX_FAILURES = 5
const DEFAULT_FAILURE_WINDOW_MS = 10 * 60 * 1_000

type FailureBucket = {
  count: number
  resetAt: number
}

export type InviteGateOptions = {
  inviteCode?: string
  cookieSecret?: string
  cookieName?: string
  sessionTtlSeconds?: number
  maxFailures?: number
  failureWindowMs?: number
}

export type InviteGate = {
  handleInviteSession: express.RequestHandler
  requireApiAuth: express.RequestHandler
  requirePageAuth: express.RequestHandler
}

export function createInviteGate(options: InviteGateOptions = {}): InviteGate {
  const inviteCode = options.inviteCode ?? process.env.PPT_INVITE_CODE ?? DEFAULT_INVITE_CODE
  const cookieSecret = options.cookieSecret ?? process.env.PPT_INVITE_COOKIE_SECRET ?? randomBytes(32).toString('hex')
  const cookieName = options.cookieName ?? INVITE_COOKIE_NAME
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_INVITE_SESSION_TTL_SECONDS
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES
  const failureWindowMs = options.failureWindowMs ?? DEFAULT_FAILURE_WINDOW_MS
  const inviteCodeHash = hashInviteCode(inviteCode)
  const failures = new Map<string, FailureBucket>()

  function handleInviteSession(request: express.Request, response: express.Response): void {
    const clientKey = resolveClientKey(request)
    if (isRateLimited(failures, clientKey, maxFailures)) {
      respondInviteFailure(request, response, 429, 'too_many_attempts')
      return
    }

    const submittedCode = readSubmittedCode(request)
    if (!constantTimeEqual(submittedCode, inviteCode)) {
      recordFailure(failures, clientKey, failureWindowMs)
      respondInviteFailure(request, response, 401, 'invalid_invite_code')
      return
    }

    failures.delete(clientKey)
    response.setHeader('set-cookie', serializeCookie(cookieName, createInviteSessionToken({
      codeHash: inviteCodeHash,
      cookieSecret,
      ttlSeconds: sessionTtlSeconds,
    }), sessionTtlSeconds))

    if (prefersJson(request)) {
      response.json({ ok: true })
      return
    }

    response.redirect(303, resolveSafeReturnTo(request))
  }

  function requireApiAuth(request: express.Request, response: express.Response, next: express.NextFunction): void {
    if (hasValidInviteSession(request, cookieName, cookieSecret, inviteCodeHash)) {
      next()
      return
    }

    response.status(401).json({
      error: 'invite_required',
    })
  }

  function requirePageAuth(request: express.Request, response: express.Response, next: express.NextFunction): void {
    if (request.path.startsWith('/api')) {
      next()
      return
    }

    if (hasValidInviteSession(request, cookieName, cookieSecret, inviteCodeHash)) {
      next()
      return
    }

    response.status(200).type('html').send(renderInvitePage(request.originalUrl || '/'))
  }

  return {
    handleInviteSession,
    requireApiAuth,
    requirePageAuth,
  }
}

function hasValidInviteSession(
  request: express.Request,
  cookieName: string,
  cookieSecret: string,
  inviteCodeHash: string,
): boolean {
  const token = readCookie(request, cookieName)
  if (!token) {
    return false
  }

  return isValidInviteSessionToken(token, cookieSecret, inviteCodeHash)
}

function readSubmittedCode(request: express.Request): string {
  const body = request.body as { code?: unknown } | undefined
  return typeof body?.code === 'string' ? body.code : ''
}

function readCookie(request: express.Request, cookieName: string): string | null {
  const rawCookie = request.header('cookie')
  if (!rawCookie) {
    return null
  }

  for (const part of rawCookie.split(';')) {
    const [name, ...valueParts] = part.trim().split('=')
    if (name === cookieName) {
      try {
        return decodeURIComponent(valueParts.join('='))
      } catch {
        return null
      }
    }
  }

  return null
}

function serializeCookie(cookieName: string, value: string, maxAgeSeconds: number): string {
  return [
    `${cookieName}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ')
}

function prefersJson(request: express.Request): boolean {
  return request.is('application/json') === 'application/json'
    || request.accepts(['json', 'html']) === 'json'
}

function respondInviteFailure(
  request: express.Request,
  response: express.Response,
  status: number,
  error: string,
): void {
  if (prefersJson(request)) {
    response.status(status).json({ error })
    return
  }

  response.status(status).type('html').send(renderInvitePage(resolveSafeReturnTo(request), '邀请码不正确'))
}

function isRateLimited(
  failures: Map<string, FailureBucket>,
  clientKey: string,
  maxFailures: number,
): boolean {
  const bucket = failures.get(clientKey)
  if (!bucket || bucket.resetAt <= Date.now()) {
    if (bucket) {
      failures.delete(clientKey)
    }
    return false
  }

  return bucket.count >= maxFailures
}

function recordFailure(
  failures: Map<string, FailureBucket>,
  clientKey: string,
  failureWindowMs: number,
): void {
  const now = Date.now()
  const existing = failures.get(clientKey)
  if (!existing || existing.resetAt <= now) {
    failures.set(clientKey, {
      count: 1,
      resetAt: now + failureWindowMs,
    })
    return
  }

  existing.count += 1
}

function resolveClientKey(request: express.Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown'
}

function resolveSafeReturnTo(request: express.Request): string {
  const body = request.body as { returnTo?: unknown } | undefined
  const rawValue = typeof body?.returnTo === 'string' ? body.returnTo : '/'
  return sanitizeReturnTo(rawValue)
}

function sanitizeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/'
  }

  return value
}

function renderInvitePage(returnTo: string, errorMessage = ''): string {
  const safeReturnTo = escapeHtml(sanitizeReturnTo(returnTo))
  const safeErrorMessage = escapeHtml(errorMessage)
  const errorHtml = safeErrorMessage
    ? `<p class="error" role="alert">${safeErrorMessage}</p>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>输入邀请码</title>
    <style>
      :root {
        color: #201715;
        background: linear-gradient(180deg, #faf6ef 0%, #f2ede5 100%);
        font-family: Inter, "Microsoft YaHei", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      main {
        width: min(420px, 100%);
        display: grid;
        gap: 18px;
        padding: 28px;
        border: 1px solid rgba(32, 23, 21, 0.12);
        border-radius: 22px;
        background: rgba(255, 250, 241, 0.92);
        box-shadow: 0 20px 56px rgba(68, 46, 31, 0.12);
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
      }
      p {
        margin: 0;
        color: rgba(32, 23, 21, 0.68);
        line-height: 1.55;
      }
      form {
        display: grid;
        gap: 12px;
      }
      label {
        display: grid;
        gap: 8px;
        font-weight: 600;
      }
      input {
        width: 100%;
        border: 1px solid rgba(32, 23, 21, 0.16);
        border-radius: 14px;
        padding: 12px 14px;
        font: inherit;
        background: #fff;
        color: inherit;
      }
      button {
        border: 0;
        border-radius: 14px;
        padding: 12px 14px;
        background: #201715;
        color: #fffaf1;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        color: #9f3417;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <div>
        <h1>输入邀请码</h1>
        <p>验证通过后可以继续使用文稿生成器。</p>
      </div>
      ${errorHtml}
      <form method="post" action="/api/invite/session">
        <input type="hidden" name="returnTo" value="${safeReturnTo}">
        <label>
          邀请码
          <input name="code" type="password" autocomplete="current-password" required autofocus>
        </label>
        <button type="submit">进入</button>
      </form>
    </main>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
