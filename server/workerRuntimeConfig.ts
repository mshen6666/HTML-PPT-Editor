import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(serverDir, '..')

export type WorkerRuntimeConfig = {
  redisUrl: string
  sandboxRoot: string
  artifactRoot: string
  uploadRoot: string
  skillBundlePath: string
  workerCommand?: string
  workerCloseTimeoutMs: number
  sandboxJanitorIntervalMs: number
  sandboxStaleAfterMs: number
  jobLimits: {
    timeoutMs: number
    maxArtifactBytes: number
    maxUploadBytes: number
    maxUploadCount: number
    maxConcurrentJobsPerUser: number
    maxConcurrentJobsPerTenant: number
  }
}

export function createWorkerRuntimeConfig(): WorkerRuntimeConfig {
  return {
    redisUrl: process.env.REDIS_URL ?? '',
    sandboxRoot: process.env.PPT_SANDBOX_ROOT ?? path.join(projectRoot, '.runtime', 'sandboxes'),
    artifactRoot: process.env.PPT_ARTIFACT_ROOT ?? path.join(projectRoot, '.runtime', 'artifacts'),
    uploadRoot: process.env.PPT_UPLOAD_ROOT ?? path.join(projectRoot, '.runtime', 'uploads'),
    skillBundlePath: process.env.PPT_SKILL_BUNDLE_PATH
      ?? path.join(projectRoot, 'server', 'embedded-skills', 'html-ppt'),
    workerCommand: process.env.PPT_WORKER_COMMAND,
    workerCloseTimeoutMs: Number(process.env.PPT_WORKER_CLOSE_TIMEOUT_MS ?? 3_000),
    sandboxJanitorIntervalMs: Number(process.env.PPT_SANDBOX_JANITOR_INTERVAL_MS ?? 120_000),
    sandboxStaleAfterMs: Number(process.env.PPT_SANDBOX_STALE_AFTER_MS ?? 60 * 60 * 1000),
    jobLimits: {
      timeoutMs: Number(process.env.PPT_JOB_TIMEOUT_MS ?? process.env.API_TIMEOUT_MS ?? 90_000),
      maxArtifactBytes: Number(process.env.PPT_MAX_ARTIFACT_BYTES ?? 2_000_000),
      maxUploadBytes: Number(process.env.PPT_MAX_UPLOAD_BYTES ?? 10_000_000),
      maxUploadCount: Number(process.env.PPT_MAX_UPLOAD_COUNT ?? 12),
      maxConcurrentJobsPerUser: Number(process.env.PPT_MAX_CONCURRENT_JOBS_PER_USER ?? 2),
      maxConcurrentJobsPerTenant: Number(process.env.PPT_MAX_CONCURRENT_JOBS_PER_TENANT ?? 12),
    },
  }
}
