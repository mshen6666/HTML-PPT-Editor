import { readdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export type SandboxJanitorRunSummary = {
  removed: string[]
  failed: Array<{
    sandboxPath: string
    message: string
  }>
}

export function createSandboxJanitor(options: {
  rootDir: string
  intervalMs: number
  staleAfterMs: number
  isActiveSandbox: (sandboxPath: string) => boolean
}) {
  let intervalHandle: NodeJS.Timeout | null = null

  async function runOnce(): Promise<SandboxJanitorRunSummary> {
    const summary: SandboxJanitorRunSummary = {
      removed: [],
      failed: [],
    }

    const sandboxPaths = await listSandboxJobDirs(options.rootDir)
    const cutoff = Date.now() - options.staleAfterMs

    for (const sandboxPath of sandboxPaths) {
      if (options.isActiveSandbox(sandboxPath)) {
        continue
      }

      try {
        const details = await stat(sandboxPath)
        if (details.mtimeMs > cutoff) {
          continue
        }

        await rm(sandboxPath, { recursive: true, force: true })
        summary.removed.push(sandboxPath)
      } catch (error) {
        summary.failed.push({
          sandboxPath,
          message: error instanceof Error ? error.message : 'sandbox janitor failed',
        })
      }
    }

    return summary
  }

  function start(): void {
    if (intervalHandle) {
      return
    }

    intervalHandle = setInterval(() => {
      void runOnce().catch((error) => {
        console.warn('[sandbox-janitor] cleanup run failed', error)
      })
    }, options.intervalMs)
    intervalHandle.unref?.()

    void runOnce().catch((error) => {
      console.warn('[sandbox-janitor] initial cleanup run failed', error)
    })
  }

  function stop(): void {
    if (!intervalHandle) {
      return
    }

    clearInterval(intervalHandle)
    intervalHandle = null
  }

  return {
    runOnce,
    start,
    stop,
  }
}

async function listSandboxJobDirs(rootDir: string): Promise<string[]> {
  const tenantDirs = await safeReadDirectories(rootDir)
  const sandboxPaths: string[] = []

  for (const tenantDir of tenantDirs) {
    const userDirs = await safeReadDirectories(tenantDir)
    for (const userDir of userDirs) {
      const sessionDirs = await safeReadDirectories(userDir)
      for (const sessionDir of sessionDirs) {
        const jobDirs = await safeReadDirectories(sessionDir)
        sandboxPaths.push(...jobDirs)
      }
    }
  }

  return sandboxPaths
}

async function safeReadDirectories(parentDir: string): Promise<string[]> {
  try {
    const entries = await readdir(parentDir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parentDir, entry.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return []
    }

    throw error
  }
}
