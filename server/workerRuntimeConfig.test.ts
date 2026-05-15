// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

import { createWorkerRuntimeConfig } from './workerRuntimeConfig'

describe('createWorkerRuntimeConfig', () => {
  const originalWorkerCommand = process.env.PPT_WORKER_COMMAND

  afterEach(() => {
    if (originalWorkerCommand === undefined) {
      delete process.env.PPT_WORKER_COMMAND
    } else {
      process.env.PPT_WORKER_COMMAND = originalWorkerCommand
    }
  })

  it('returns undefined worker command when PPT_WORKER_COMMAND is not set', () => {
    delete process.env.PPT_WORKER_COMMAND

    expect(createWorkerRuntimeConfig().workerCommand).toBeUndefined()
  })

  it('uses an explicit worker command when configured', () => {
    process.env.PPT_WORKER_COMMAND = 'custom-worker --mode stdio'

    expect(createWorkerRuntimeConfig().workerCommand).toBe('custom-worker --mode stdio')
  })
})
