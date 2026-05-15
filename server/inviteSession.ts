import { createHmac, createHash, timingSafeEqual } from 'node:crypto'

export const DEFAULT_INVITE_CODE = 'helloWorld'
export const INVITE_COOKIE_NAME = 'ppt_invite_session'
export const DEFAULT_INVITE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 3

export function createInviteSessionToken(options: {
  codeHash: string
  cookieSecret: string
  ttlSeconds: number
}): string {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    codeHash: options.codeHash,
    expiresAt: Date.now() + options.ttlSeconds * 1_000,
  })).toString('base64url')
  const signature = signInviteSessionPayload(payload, options.cookieSecret)
  return `${payload}.${signature}`
}

export function isValidInviteSessionToken(
  token: string,
  cookieSecret: string,
  inviteCodeHash: string,
): boolean {
  const [payload, signature] = token.split('.')
  if (!payload || !signature || !constantTimeEqual(signature, signInviteSessionPayload(payload, cookieSecret))) {
    return false
  }

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      version?: unknown
      codeHash?: unknown
      expiresAt?: unknown
    }
    return session.version === 1
      && typeof session.codeHash === 'string'
      && constantTimeEqual(session.codeHash, inviteCodeHash)
      && typeof session.expiresAt === 'number'
      && session.expiresAt > Date.now()
  } catch {
    return false
  }
}

export function hashInviteCode(inviteCode: string): string {
  return createHash('sha256').update(inviteCode).digest('base64url')
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function signInviteSessionPayload(payload: string, cookieSecret: string): string {
  return createHmac('sha256', cookieSecret).update(payload).digest('base64url')
}
