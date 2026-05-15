import Redis from 'ioredis'

import type { AgentSessionSnapshot } from '../src/agent/protocol'
import type { SessionOwner } from './sessionIdentity'

export type AgentSessionRecord = {
  conversationId: string | null
  updatedAt: number
  snapshot?: AgentSessionSnapshot
}

export type { SessionOwner } from './sessionIdentity'

export interface SessionStore {
  get(owner: SessionOwner): Promise<AgentSessionRecord | null>
  set(owner: SessionOwner, value: AgentSessionRecord): Promise<void>
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, AgentSessionRecord>()

  async get(owner: SessionOwner): Promise<AgentSessionRecord | null> {
    return this.records.get(createSessionKey(owner)) ?? null
  }

  async set(owner: SessionOwner, value: AgentSessionRecord): Promise<void> {
    this.records.set(createSessionKey(owner), value)
  }
}

export class RedisSessionStore implements SessionStore {
  constructor(
    private readonly client: Redis,
    private readonly ttlSeconds = 60 * 60 * 24 * 7,
  ) {}

  async get(owner: SessionOwner): Promise<AgentSessionRecord | null> {
    const raw = await this.client.get(this.createKey(owner))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as AgentSessionRecord
    return parsed
  }

  async set(owner: SessionOwner, value: AgentSessionRecord): Promise<void> {
    await this.client.set(this.createKey(owner), JSON.stringify(value), 'EX', this.ttlSeconds)
  }

  private createKey(owner: SessionOwner): string {
    return createSessionKey(owner)
  }
}

export function createSessionStore(): SessionStore {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    return new InMemorySessionStore()
  }

  return new RedisSessionStore(new Redis(redisUrl))
}

function createSessionKey(owner: SessionOwner): string {
  return `ppt-agent-session:${owner.tenantId}:${owner.userId}:${owner.sessionId}`
}
