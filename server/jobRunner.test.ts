// @vitest-environment node

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  FileSystemArtifactStore,
  type StoredArtifactRef,
} from './artifactStore'
import { createJobRunner } from './jobRunner'
import { FileSystemSandboxManager } from './sandboxManager'
import { FileSystemUploadStore } from './uploadStore'

describe('createJobRunner', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('creates an isolated sandbox per job, materializes persisted uploads, persists html artifacts, and cleans up the sandbox', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-job-runner-'))
    tempDirs.push(root)

    const sandboxRoot = path.join(root, 'sandboxes')
    const artifactRoot = path.join(root, 'artifacts')
    const uploadRoot = path.join(root, 'uploads')
    const skillRoot = path.join(root, 'skills')
    await mkdir(path.join(skillRoot, 'html-ppt'), { recursive: true })
    await writeFile(path.join(skillRoot, 'html-ppt', 'SKILL.md'), '# skill\n', 'utf8')

    const uploadStore = new FileSystemUploadStore({ rootDir: uploadRoot })
    const artifactStore = new FileSystemArtifactStore({ rootDir: artifactRoot })
    const sandboxManager = new FileSystemSandboxManager({
      rootDir: sandboxRoot,
      skillBundlePath: path.join(skillRoot, 'html-ppt'),
    })
    const runner = createJobRunner({
      sandboxManager,
      artifactStore,
      uploadStore,
    })

    const uploadedAsset = await uploadStore.save({
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
      fileName: 'logo.png',
      contentType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    })

    const seenSandboxPaths: string[] = []
    let persistedArtifact: StoredArtifactRef | null = null

    const result = await runner.runHtmlJob({
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
      currentDeckHtml: '<!doctype html><html><head><title>Current</title></head><body><section class="slide"><h1>Current</h1></section></body></html>',
      uploadedAssets: [uploadedAsset],
      execute: async ({ sandbox }) => {
        seenSandboxPaths.push(sandbox.rootDir)

        await expect(readFile(sandbox.currentDeckPath, 'utf8')).resolves.toContain('<title>Current</title>')
        await expect(readFile(path.join(sandbox.assetsDir, 'logo.png'))).resolves.toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]))

        await writeFile(
          sandbox.outputHtmlPath,
          '<!doctype html><html><head><title>Generated</title></head><body><section class="slide"><h1>Generated</h1></section></body></html>',
          'utf8',
        )
      },
    })

    persistedArtifact = result.htmlArtifact

    expect(seenSandboxPaths).toHaveLength(1)
    expect(seenSandboxPaths[0]).toContain(path.join(root, 'sandboxes'))
    expect(seenSandboxPaths[0]).not.toContain(path.normalize('D:\\workspace\\ppt'))
    await expect(readFile(persistedArtifact.absolutePath, 'utf8')).resolves.toContain('<title>Generated</title>')
    await expect(readFile(seenSandboxPaths[0], 'utf8')).rejects.toThrow()
  })

  it('cleans up the sandbox when execution fails', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-job-runner-fail-'))
    tempDirs.push(root)

    const sandboxRoot = path.join(root, 'sandboxes')
    const artifactStore = new FileSystemArtifactStore({ rootDir: path.join(root, 'artifacts') })
    const uploadStore = new FileSystemUploadStore({ rootDir: path.join(root, 'uploads') })
    const sandboxManager = new FileSystemSandboxManager({
      rootDir: sandboxRoot,
      skillBundlePath: path.join(root, 'skills'),
    })
    const runner = createJobRunner({
      sandboxManager,
      artifactStore,
      uploadStore,
    })

    let sandboxPath = ''

    await expect(runner.runHtmlJob({
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
      currentDeckHtml: '<!doctype html><html><head><title>Current</title></head><body></body></html>',
      uploadedAssets: [],
      execute: async ({ sandbox }) => {
        sandboxPath = sandbox.rootDir
        throw new Error('sandbox execution failed')
      },
    })).rejects.toThrow('sandbox execution failed')

    await expect(readFile(sandboxPath, 'utf8')).rejects.toThrow()
  })
})
