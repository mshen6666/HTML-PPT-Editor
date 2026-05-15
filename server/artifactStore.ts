import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type StoredArtifactRef = {
  artifactId: string
  tenantId: string
  userId: string
  sessionId: string
  jobId: string
  fileName: string
  contentType: string
  sizeBytes: number
  relativePath: string
  absolutePath: string
  createdAt: number
}

export interface ArtifactStore {
  save(args: {
    tenantId: string
    userId: string
    sessionId: string
    jobId: string
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<StoredArtifactRef>
  readText(ref: StoredArtifactRef): Promise<string>
  findById?(args: {
    tenantId: string
    userId: string
    sessionId: string
    artifactId: string
  }): Promise<StoredArtifactRef | null>
  readBuffer?(ref: StoredArtifactRef): Promise<Buffer>
}

export class FileSystemArtifactStore implements ArtifactStore {
  constructor(
    private readonly options: {
      rootDir: string
    },
  ) {}

  async save(args: {
    tenantId: string
    userId: string
    sessionId: string
    jobId: string
    fileName: string
    contentType: string
    buffer: Buffer
  }): Promise<StoredArtifactRef> {
    const artifactId = randomUUID()
    const safeFileName = sanitizeFileName(args.fileName)
    const relativePath = path.join(args.tenantId, args.userId, args.sessionId, args.jobId, `${artifactId}-${safeFileName}`)
    const absolutePath = path.join(this.options.rootDir, relativePath)

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, args.buffer)

    return {
      artifactId,
      tenantId: args.tenantId,
      userId: args.userId,
      sessionId: args.sessionId,
      jobId: args.jobId,
      fileName: safeFileName,
      contentType: args.contentType,
      sizeBytes: args.buffer.byteLength,
      relativePath,
      absolutePath,
      createdAt: Date.now(),
    }
  }

  async readText(ref: StoredArtifactRef): Promise<string> {
    return readFile(ref.absolutePath, 'utf8')
  }

  async findById(args: {
    tenantId: string
    userId: string
    sessionId: string
    artifactId: string
  }): Promise<StoredArtifactRef | null> {
    const root = path.join(this.options.rootDir, args.tenantId, args.userId, args.sessionId)
    let entries: string[]
    try {
      entries = await collectFiles(root)
    } catch {
      return null
    }

    const absolutePath = entries.find((entry) => path.basename(entry).startsWith(`${args.artifactId}-`))
    if (!absolutePath) {
      return null
    }

    const relativePath = path.relative(this.options.rootDir, absolutePath)
    const fileName = path.basename(absolutePath).slice(`${args.artifactId}-`.length)
    const buffer = await readFile(absolutePath)
    return {
      artifactId: args.artifactId,
      tenantId: args.tenantId,
      userId: args.userId,
      sessionId: args.sessionId,
      jobId: path.basename(path.dirname(absolutePath)),
      fileName,
      contentType: contentTypeForFileName(fileName),
      sizeBytes: buffer.byteLength,
      relativePath,
      absolutePath,
      createdAt: 0,
    }
  }

  async readBuffer(ref: StoredArtifactRef): Promise<Buffer> {
    return readFile(ref.absolutePath)
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
}

async function collectFiles(root: string): Promise<string[]> {
  const fs = await import('node:fs/promises')
  const entries = await fs.readdir(root, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      return collectFiles(absolutePath)
    }
    return [absolutePath]
  }))
  return files.flat()
}

function contentTypeForFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase()
  if (ext === '.pptx') {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
  if (ext === '.html' || ext === '.htm') {
    return 'text/html; charset=utf-8'
  }
  return 'application/octet-stream'
}
