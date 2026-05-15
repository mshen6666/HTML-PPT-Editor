import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

import type { ArtifactStore, StoredArtifactRef } from './artifactStore'
import type { SandboxHandle, SandboxManager } from './sandboxManager'
import type { UploadStore, UploadedAssetRef } from './uploadStore'

export type HtmlJobResult = {
  jobId: string
  sandboxId: string
  htmlArtifact: StoredArtifactRef
  html: string
}

export function createJobRunner(options: {
  sandboxManager: SandboxManager
  artifactStore: ArtifactStore
  uploadStore: UploadStore
}) {
  return {
    async runHtmlJob(args: {
      tenantId: string
      userId: string
      sessionId: string
      currentDeckHtml: string
      uploadedAssets: UploadedAssetRef[]
      execute: (context: { jobId: string; sandbox: SandboxHandle }) => Promise<void>
    }): Promise<HtmlJobResult> {
      const jobId = randomUUID()
      const sandbox = await options.sandboxManager.create({
        tenantId: args.tenantId,
        userId: args.userId,
        sessionId: args.sessionId,
        jobId,
        currentDeckHtml: args.currentDeckHtml,
      })

      try {
        await options.uploadStore.materialize(args.uploadedAssets, sandbox.assetsDir)
        await args.execute({ jobId, sandbox })

        const html = await readFile(sandbox.outputHtmlPath, 'utf8')
        const htmlArtifact = await options.artifactStore.save({
          tenantId: args.tenantId,
          userId: args.userId,
          sessionId: args.sessionId,
          jobId,
          fileName: 'presentation.html',
          contentType: 'text/html; charset=utf-8',
          buffer: Buffer.from(html, 'utf8'),
        })

        return {
          jobId,
          sandboxId: sandbox.sandboxId,
          htmlArtifact,
          html,
        }
      } finally {
        await options.sandboxManager.destroy(sandbox)
      }
    },
  }
}
