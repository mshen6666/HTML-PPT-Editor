import type express from 'express'

export type SessionIdentity = {
  tenantId: string
  userId: string
}

export type SessionOwner = SessionIdentity & {
  sessionId: string
}

const DEFAULT_TENANT_ID = 'local-tenant'
const DEFAULT_USER_ID = 'local-user'

export function resolveSessionIdentity(request: express.Request): SessionIdentity {
  const tenantId = readHeader(request, 'x-ppt-tenant-id') ?? DEFAULT_TENANT_ID
  const userId = readHeader(request, 'x-ppt-user-id') ?? DEFAULT_USER_ID

  return {
    tenantId,
    userId,
  }
}

export function createSessionOwner(request: express.Request, sessionId: string): SessionOwner {
  return {
    ...resolveSessionIdentity(request),
    sessionId,
  }
}

function readHeader(request: express.Request, name: string): string | null {
  const value = request.header(name)
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
