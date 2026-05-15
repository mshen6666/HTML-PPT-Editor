// @vitest-environment node

import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createSandboxJanitor } from './sandboxJanitor'

describe('createSandboxJanitor', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('removes stale orphan sandboxes without touching active job directories', async () => {
    const root = await mkdirTempDir('ppt-sandbox-janitor-')
    tempDirs.push(root)

    const orphanSandbox = path.join(root, 'tenant-a', 'user-a', 'session-a', 'job-1-sandbox-1')
    const activeSandbox = path.join(root, 'tenant-a', 'user-a', 'session-a', 'job-2-sandbox-2')
    await mkdir(orphanSandbox, { recursive: true })
    await mkdir(activeSandbox, { recursive: true })
    await writeFile(path.join(orphanSandbox, 'presentation.html'), '<!doctype html>', 'utf8')
    await writeFile(path.join(activeSandbox, 'presentation.html'), '<!doctype html>', 'utf8')

    const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await utimes(orphanSandbox, staleDate, staleDate)
    await utimes(path.join(orphanSandbox, 'presentation.html'), staleDate, staleDate)

    const janitor = createSandboxJanitor({
      rootDir: root,
      intervalMs: 120_000,
      staleAfterMs: 60 * 60 * 1000,
      isActiveSandbox: (sandboxPath) => sandboxPath === activeSandbox,
    })

    const summary = await janitor.runOnce()

    expect(summary.removed).toEqual([orphanSandbox])
    expect(summary.failed).toEqual([])
    await expect(stat(orphanSandbox)).rejects.toThrow()
    await expect(stat(activeSandbox)).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    })
  })
})

async function mkdirTempDir(prefix: string): Promise<string> {
  const { mkdtemp } = await import('node:fs/promises')
  return mkdtemp(path.join(os.tmpdir(), prefix))
}
