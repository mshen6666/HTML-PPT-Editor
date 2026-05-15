import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

import {
  DEFAULT_INVITE_CODE,
  INVITE_COOKIE_NAME,
  hashInviteCode,
  isValidInviteSessionToken,
} from './server/inviteSession'

export default defineConfig({
  plugins: [inviteGateDevPlugin(), react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})

function inviteGateDevPlugin(): Plugin {
  const inviteCode = process.env.PPT_INVITE_CODE ?? DEFAULT_INVITE_CODE
  const cookieSecret = process.env.PPT_INVITE_COOKIE_SECRET
  const inviteCodeHash = hashInviteCode(inviteCode)

  return {
    name: 'ppt-invite-gate-dev',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? '/'
        if (
          requestUrl.startsWith('/api')
          || (cookieSecret && hasValidInviteCookie(request.headers.cookie, cookieSecret, inviteCodeHash))
        ) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(renderInvitePage(requestUrl))
      })
    },
  }
}

function hasValidInviteCookie(
  cookieHeader: string | undefined,
  cookieSecret: string,
  inviteCodeHash: string,
): boolean {
  const token = readCookie(cookieHeader, INVITE_COOKIE_NAME)
  return token ? isValidInviteSessionToken(token, cookieSecret, inviteCodeHash) : false
}

function readCookie(cookieHeader: string | undefined, cookieName: string): string | null {
  if (!cookieHeader) {
    return null
  }

  for (const part of cookieHeader.split(';')) {
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

function renderInvitePage(returnTo: string): string {
  const safeReturnTo = escapeHtml(sanitizeReturnTo(returnTo))
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
      h1 { margin: 0; font-size: 1.5rem; }
      p {
        margin: 0;
        color: rgba(32, 23, 21, 0.68);
        line-height: 1.55;
      }
      form { display: grid; gap: 12px; }
      label { display: grid; gap: 8px; font-weight: 600; }
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
    </style>
  </head>
  <body>
    <main>
      <div>
        <h1>输入邀请码</h1>
        <p>验证通过后可以继续使用演示文稿生成器。</p>
      </div>
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

function sanitizeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/'
  }

  return value
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
