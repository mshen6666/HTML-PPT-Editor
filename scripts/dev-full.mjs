import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

loadDotEnvIfPresent('.env.production')

const env = {
  ...process.env,
  PPT_INVITE_COOKIE_SECRET: process.env.PPT_INVITE_COOKIE_SECRET || randomBytes(32).toString('hex'),
}

const commands = [
  { name: 'frontend', args: ['run', 'dev'] },
  { name: 'server', args: ['run', 'dev:server'] },
]

const children = commands.map((command) =>
  spawn('npm', command.args, {
    stdio: 'inherit',
    shell: true,
    env,
  }),
)

let shuttingDown = false

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
  process.exit(exitCode)
}

for (const [index, child] of children.entries()) {
  child.on('exit', (code) => {
    shutdown(code ?? (index === 0 ? 0 : 1))
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

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
