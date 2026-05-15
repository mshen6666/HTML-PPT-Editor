import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type UploadedAssetRef = {
  uploadId: string
  tenantId: string
  userId: string
  sessionId: string
  fileName: string
  contentType: string
  sizeBytes: number
  relativePath: string
  absolutePath: string
  createdAt: number
}

export type MaterializedAsset = UploadedAssetRef & {
  sandboxPath: string
}

export interface UploadStore {
  save(args: {
    tenantId: string
    userId: string
    sessionId: string
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<UploadedAssetRef>
  saveCompanion(args: {
    parentAsset: UploadedAssetRef
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<UploadedAssetRef>
  materialize(assets: UploadedAssetRef[], targetDir: string): Promise<MaterializedAsset[]>
}

export class FileSystemUploadStore implements UploadStore {
  constructor(
    private readonly options: {
      rootDir: string
    },
  ) {}

  async save(args: {
    tenantId: string
    userId: string
    sessionId: string
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<UploadedAssetRef> {
    const uploadId = randomUUID()
    const safeFileName = sanitizeFileName(args.fileName)
    const relativePath = path.join(args.tenantId, args.userId, args.sessionId, `${uploadId}-${safeFileName}`)
    const absolutePath = path.join(this.options.rootDir, relativePath)

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, args.buffer)

    return {
      uploadId,
      tenantId: args.tenantId,
      userId: args.userId,
      sessionId: args.sessionId,
      fileName: safeFileName,
      contentType: args.contentType,
      sizeBytes: args.buffer.byteLength,
      relativePath,
      absolutePath,
      createdAt: Date.now(),
    }
  }

  async materialize(assets: UploadedAssetRef[], targetDir: string): Promise<MaterializedAsset[]> {
    await mkdir(targetDir, { recursive: true })

    return Promise.all(
      assets.map(async (asset) => {
        const sandboxPath = path.join(targetDir, asset.fileName)
        await copyFile(asset.absolutePath, sandboxPath)
        const details = await stat(sandboxPath)

        return {
          ...asset,
          sizeBytes: details.size,
          sandboxPath,
        }
      }),
    )
  }

  async saveCompanion(args: {
    parentAsset: UploadedAssetRef
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<UploadedAssetRef> {
    const safeFileName = sanitizeFileName(args.fileName)
    const companionFileName = `${args.parentAsset.uploadId}-${safeFileName}`
    const dir = path.dirname(args.parentAsset.absolutePath)
    const companionPath = path.join(dir, companionFileName)
    const relativePath = path.join(
      args.parentAsset.tenantId,
      args.parentAsset.userId,
      args.parentAsset.sessionId,
      companionFileName,
    )

    await mkdir(path.dirname(companionPath), { recursive: true })
    await writeFile(companionPath, args.buffer)

    return {
      uploadId: args.parentAsset.uploadId,
      tenantId: args.parentAsset.tenantId,
      userId: args.parentAsset.userId,
      sessionId: args.parentAsset.sessionId,
      fileName: companionFileName,
      contentType: args.contentType,
      sizeBytes: args.buffer.byteLength,
      relativePath,
      absolutePath: companionPath,
      createdAt: Date.now(),
    }
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
}
