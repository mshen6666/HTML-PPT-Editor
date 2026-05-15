import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { query } from '@anthropic-ai/claude-agent-sdk'

const require = createRequire(import.meta.url)

loadDotEnvIfPresent('.env.production')

const model = process.env.ANTHROPIC_MODEL?.trim() || 'MiniMax-M2.7'
const sandboxDir = await mkdtemp(path.join(os.tmpdir(), 'ppt-claude-smoke-'))
const outputPath = path.join(sandboxDir, 'modern-art-history.html')

try {
  const env = buildClaudeCodeEnv()
  const stream = query({
    prompt: [
      'Write a concise standalone HTML presentation brief to this exact path:',
      outputPath,
      'Topic: 近代艺术史简报.',
      'Requirements: 6 slides, Chinese content, include key movements from Impressionism to Surrealism, polished visual style.',
      'Do not ask questions. Do not print the full HTML in chat.',
    ].join('\n'),
    options: {
      cwd: sandboxDir,
      tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: false,
      settingSources: [],
      maxTurns: 8,
      model,
      pathToClaudeCodeExecutable: resolveClaudeCodeExecutable(),
      env,
      stderr: (data) => {
        const text = data.trim()
        if (text) {
          console.warn('[claude-code-smoke] stderr', text)
        }
      },
    },
  })

  for await (const message of stream) {
    if (message.type === 'result' && message.subtype !== 'success') {
      throw new Error(message.result || message.errors?.join('\n') || `Claude Code failed: ${message.subtype}`)
    }
  }

  const html = await readFile(outputPath, 'utf8')
  if (!html.includes('<html') || !html.includes('近代艺术史')) {
    throw new Error(`Smoke test output is not the expected presentation HTML: ${outputPath}`)
  }

  console.log(JSON.stringify({
    ok: true,
    model,
    outputPath,
    bytes: Buffer.byteLength(html, 'utf8'),
  }, null, 2))
} finally {
  if (process.env.PPT_KEEP_CLAUDE_SMOKE_OUTPUT !== '1') {
    await rm(sandboxDir, { recursive: true, force: true })
  }
}

function loadDotEnvIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index === -1) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim()
    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function buildClaudeCodeEnv() {
  const env = {
    ...process.env,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
      process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1',
  }

  if (!env.ANTHROPIC_API_KEY && env.ANTHROPIC_AUTH_TOKEN) {
    env.ANTHROPIC_API_KEY = env.ANTHROPIC_AUTH_TOKEN
  }

  return env
}

function resolveClaudeCodeExecutable() {
  const configuredPath = process.env.PPT_CLAUDE_CODE_EXECUTABLE?.trim()
  if (configuredPath) {
    return configuredPath
  }

  const packageName = getPreferredClaudeCodeNativePackage()
  if (!packageName) {
    return undefined
  }

  try {
    return require.resolve(`${packageName}/${process.platform === 'win32' ? 'claude.exe' : 'claude'}`)
  } catch {
    return undefined
  }
}

function getPreferredClaudeCodeNativePackage() {
  const arch = process.arch
  if (arch !== 'x64' && arch !== 'arm64') {
    return undefined
  }

  if (process.platform === 'linux') {
    const libcSuffix = isGlibcRuntime() ? '' : '-musl'
    return `@anthropic-ai/claude-agent-sdk-linux-${arch}${libcSuffix}`
  }

  if (process.platform === 'darwin' || process.platform === 'win32') {
    return `@anthropic-ai/claude-agent-sdk-${process.platform}-${arch}`
  }

  return undefined
}

function isGlibcRuntime() {
  return Boolean(process.report?.getReport().header.glibcVersionRuntime)
}
