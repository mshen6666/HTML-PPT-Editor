// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

const rmMock = vi.fn()

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    rm: rmMock,
  }
})

describe('FileSystemSandboxManager', () => {
  afterEach(() => {
    rmMock.mockReset()
  })

  it('retries busy directory cleanup before succeeding', async () => {
    const { FileSystemSandboxManager } = await import('./sandboxManager')
    const manager = new FileSystemSandboxManager({
      rootDir: 'D:/workspace/ppt/.runtime/sandboxes',
      skillBundlePath: 'D:/workspace/ppt/server/embedded-skills/html-ppt',
    })

    const busyError = new Error('busy') as NodeJS.ErrnoException
    busyError.code = 'EBUSY'
    rmMock
      .mockRejectedValueOnce(busyError)
      .mockRejectedValueOnce(busyError)
      .mockResolvedValueOnce(undefined)

    await expect(manager.destroy({
      sandboxId: 'sandbox-1',
      rootDir: 'D:/workspace/ppt/.runtime/sandboxes/tenant/user/session/job-sandbox',
      currentDeckPath: '',
      outputHtmlPath: '',
      assetsDir: '',
      skillBundlePath: 'D:/workspace/ppt/server/embedded-skills/html-ppt',
    })).resolves.toBeUndefined()

    expect(rmMock).toHaveBeenCalledTimes(3)
  })
})
