import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import express from 'express'

import { createAiServer } from './createAiServer'
import { createInviteGate } from './inviteGate'
import { createConfiguredDeckAgent } from './deckAgent'
import { createConfiguredClaudeCodePptxExportAgent } from './claudeCodePptxExportAgent'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const distDir = path.join(projectRoot, 'dist')
const port = Number(process.env.PORT ?? 8787)

async function start(): Promise<void> {
  const inviteGate = createInviteGate()
  const server = createAiServer({
    agent: createConfiguredDeckAgent(),
    pptxExportAgent: createConfiguredClaudeCodePptxExportAgent(),
    inviteGate,
  })

  if (existsSync(distDir)) {
    server.app.use(inviteGate.requirePageAuth)
    server.app.use(express.static(distDir))
    server.app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(path.join(distDir, 'index.html'))
    })
  }

  const address = await server.listen(port)
  console.log(`AI server listening on ${address}`)
}

void start()
