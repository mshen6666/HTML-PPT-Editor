// @vitest-environment node

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildClaudeCodeEnv, loadPptServerEnvFiles } from './agentAuthConfig'

const originalEnv = { ...process.env }

describe('agentAuthConfig', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('loads local server env files without overwriting existing process env values', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'ppt-auth-config-'))

    try {
      process.env.ANTHROPIC_AUTH_TOKEN = 'existing-token'
      await writeFile(
        path.join(tempDir, '.env.local'),
        [
          'ANTHROPIC_AUTH_TOKEN=file-token',
          'ANTHROPIC_BASE_URL="https://example.test"',
          'INVALID-KEY=ignored',
        ].join('\n'),
      )

      loadPptServerEnvFiles(tempDir)

      expect(process.env.ANTHROPIC_AUTH_TOKEN).toBe('existing-token')
      expect(process.env.ANTHROPIC_BASE_URL).toBe('https://example.test')
      expect(process.env['INVALID-KEY']).toBeUndefined()
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('maps ANTHROPIC_AUTH_TOKEN to ANTHROPIC_API_KEY for Claude Code consumers', () => {
    const env = buildClaudeCodeEnv({
      ANTHROPIC_AUTH_TOKEN: 'auth-token',
    } as NodeJS.ProcessEnv)

    expect(env.ANTHROPIC_API_KEY).toBe('auth-token')
    expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1')
  })
})
