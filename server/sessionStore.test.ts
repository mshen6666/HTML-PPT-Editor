// @vitest-environment node

import { describe, expect, it } from 'vitest'

import {
  InMemorySessionStore,
  type SessionOwner,
} from './sessionStore'

describe('InMemorySessionStore', () => {
  it('namespaces records by tenant and user instead of trusting the raw session id globally', async () => {
    const store = new InMemorySessionStore()
    const ownerA: SessionOwner = {
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'shared-session',
    }
    const ownerB: SessionOwner = {
      tenantId: 'tenant-b',
      userId: 'user-b',
      sessionId: 'shared-session',
    }

    await store.set(ownerA, {
      conversationId: 'conversation-a',
      updatedAt: Date.now(),
    })
    await store.set(ownerB, {
      conversationId: 'conversation-b',
      updatedAt: Date.now(),
    })

    await expect(store.get(ownerA)).resolves.toEqual(expect.objectContaining({
      conversationId: 'conversation-a',
    }))
    await expect(store.get(ownerB)).resolves.toEqual(expect.objectContaining({
      conversationId: 'conversation-b',
    }))
  })
})
