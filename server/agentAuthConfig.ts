import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const ENV_FILE_NAMES = ['.env.local', '.env']

export function loadPptServerEnvFiles(serverDir: string): void {
  for (const fileName of ENV_FILE_NAMES) {
    const filePath = path.join(serverDir, fileName)
    if (!existsSync(filePath)) {
      continue
    }

    const entries = parseEnvFile(readFileSync(filePath, 'utf8'))
    for (const [key, value] of Object.entries(entries)) {
      if (process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  }
}

export function buildClaudeCodeEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  extraEnv: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  const env = {
    ...baseEnv,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      baseEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1',
    ...extraEnv,
  }

  if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_AUTH_TOKEN) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_AUTH_TOKEN
  }

  if (!env.ANTHROPIC_API_KEY && !env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error(
      'PPT AI 服务未配置模型凭据：请在 server/.env.local 或系统环境变量中设置 ANTHROPIC_AUTH_TOKEN、ANTHROPIC_API_KEY 或 CLAUDE_CODE_OAUTH_TOKEN。',
    )
  }

  return env
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue
    }

    result[key] = stripEnvValue(line.slice(separatorIndex + 1).trim())
  }

  return result
}

function stripEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

