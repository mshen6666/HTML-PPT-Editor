// @vitest-environment node

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { FileSystemUploadStore } from './uploadStore'

describe('FileSystemUploadStore', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
    tempDirs.length = 0
  })

  it('materializes companion assets with parent-scoped names when extracted files share a basename', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'ppt-upload-store-'))
    tempDirs.push(root)

    const uploadStore = new FileSystemUploadStore({ rootDir: path.join(root, 'uploads') })
    const firstParent = await uploadStore.save({
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
      fileName: 'first.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('first docx'),
    })
    const secondParent = await uploadStore.save({
      tenantId: 'tenant-a',
      userId: 'user-a',
      sessionId: 'session-a',
      fileName: 'second.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('second docx'),
    })

    const firstImage = await uploadStore.saveCompanion({
      parentAsset: firstParent,
      fileName: 'image1.png',
      contentType: 'image/png',
      buffer: Buffer.from('first image'),
    })
    const secondImage = await uploadStore.saveCompanion({
      parentAsset: secondParent,
      fileName: 'image1.png',
      contentType: 'image/png',
      buffer: Buffer.from('second image'),
    })

    const materialized = await uploadStore.materialize(
      [firstImage, secondImage],
      path.join(root, 'sandbox', 'assets'),
    )

    expect(materialized[0].fileName).not.toBe(materialized[1].fileName)
    expect(materialized[0].sandboxPath).not.toBe(materialized[1].sandboxPath)
    await expect(readFile(materialized[0].sandboxPath, 'utf8')).resolves.toBe('first image')
    await expect(readFile(materialized[1].sandboxPath, 'utf8')).resolves.toBe('second image')
  })
})
