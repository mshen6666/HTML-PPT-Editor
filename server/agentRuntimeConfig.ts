export const agentRuntimeConfig = {
  model: process.env.ANTHROPIC_MODEL?.trim() || 'MiniMax-M2.7',
} as const
