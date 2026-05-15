import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DESTROY_RETRY_DELAYS_MS = [250, 500, 1_000]

export type SandboxHandle = {
  sandboxId: string
  rootDir: string
  currentDeckPath: string
  outputHtmlPath: string
  assetsDir: string
  skillBundlePath: string
}

export interface SandboxManager {
  create(args: {
    tenantId: string
    userId: string
    sessionId: string
    jobId: string
    currentDeckHtml: string
  }): Promise<SandboxHandle>
  destroy(handle: SandboxHandle): Promise<void>
}

export class FileSystemSandboxManager implements SandboxManager {
  private readonly activeSandboxRoots = new Set<string>()

  constructor(
    private readonly options: {
      rootDir: string
      skillBundlePath: string
    },
  ) {}

  async create(args: {
    tenantId: string
    userId: string
    sessionId: string
    jobId: string
    currentDeckHtml: string
  }): Promise<SandboxHandle> {
    const sandboxId = randomUUID()
    const rootDir = path.join(
      this.options.rootDir,
      args.tenantId,
      args.userId,
      args.sessionId,
      `${args.jobId}-${sandboxId}`,
    )
    const currentDeckPath = path.join(rootDir, 'current-deck.html')
    const outputHtmlPath = path.join(rootDir, 'presentation.html')
    const assetsDir = path.join(rootDir, 'assets')

    await mkdir(assetsDir, { recursive: true })
    await writeFile(currentDeckPath, args.currentDeckHtml, 'utf8')
    await writeFile(outputHtmlPath, '', 'utf8')
    this.activeSandboxRoots.add(rootDir)

    return {
      sandboxId,
      rootDir,
      currentDeckPath,
      outputHtmlPath,
      assetsDir,
      skillBundlePath: this.options.skillBundlePath,
    }
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    this.activeSandboxRoots.delete(handle.rootDir)

    let lastError: unknown
    for (let attempt = 0; attempt <= DESTROY_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await rm(handle.rootDir, { recursive: true, force: true })
        return
      } catch (error) {
        lastError = error
        if (!isRetriableCleanupError(error) || attempt === DESTROY_RETRY_DELAYS_MS.length) {
          throw error
        }

        await delay(DESTROY_RETRY_DELAYS_MS[attempt])
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Sandbox cleanup failed')
  }

  isActiveSandbox(rootDir: string): boolean {
    return this.activeSandboxRoots.has(rootDir)
  }
}

function isRetriableCleanupError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EPERM' || code === 'ENOTEMPTY'
}

function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs)
  })
}
