import Anthropic from '@anthropic-ai/sdk'

import {
  type OptimizePromptRequest,
  type OptimizePromptResponse,
} from '../src/agent/protocol'

const OPTIMIZE_TIMEOUT_MS = 30_000

const SYSTEM_INSTRUCTION = `你是一个提示词优化助手，专门为 HTML 演示文稿生成工具优化用户输入的提示词。

你的任务是改写用户的原始提示词，使其更有效地被该工具的智能体理解和执行。

该工具具备以下能力：
- 从零生成 HTML 演示文稿，或基于现有演示进行修改
- 支持多种主题风格：tokyo-night（东京夜色）、corporate-clean（商务简洁）、editorial-serif（编辑衬线）、xiaohongshu-white（小红书白色）等
- 支持多种模板：tech-sharing（技术分享）、pitch-deck（融资路演）、product-launch（产品发布）、course-module（课程模块）等
- 支持受众类型：engineers（工程师）、executives（高管）、students（学生）、consumers（消费者）、general（通用）
- 支持输出格式：live（现场演示）、pdf、xhs（小红书图文）、standalone（独立 HTML）
- 可进行联网搜索获取最新资料
- 可压缩内容、增强视觉效果、或进行通用改写

优化提示词的最佳实践：
1. 明确指定目标受众
2. 提及期望的页数（如"10页"）
3. 说明期望的主题或视觉风格偏好
4. 清晰表述演示的目的和场景
5. 如果不是现场演示，说明输出格式
6. 保持核心需求简洁，但包含结构性提示

请改写用户的提示词，融入上述最佳实践，同时保留用户的原始意图。
用与输入相同的语言输出优化后的提示词。

请严格按以下 JSON 格式返回，不要添加任何其他内容：
{"optimizedPrompt": "优化后的提示词内容", "explanation": "简短的中文优化说明"}`

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`请求超时（${ms / 1000}秒）`)), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const baseURL = process.env.ANTHROPIC_BASE_URL || undefined
  return new Anthropic({ apiKey, baseURL })
}

export async function optimizePrompt(
  rawPrompt: string,
  context?: OptimizePromptRequest['context'],
): Promise<OptimizePromptResponse> {
  const client = createAnthropicClient()
  const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514'

  const contextHint = [
    context?.generationMode ? `生成模式：${context.generationMode === 'from-scratch' ? '从零生成' : '基于当前演示修改'}` : null,
    context?.hasUploadedAssets ? '用户已上传参考资料' : null,
  ].filter(Boolean).join('；')

  const userMessage = contextHint
    ? `${rawPrompt}\n\n【上下文信息】${contextHint}`
    : rawPrompt

  try {
    const response = await withTimeout(
      client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_INSTRUCTION,
        messages: [{ role: 'user', content: userMessage }],
      }),
      OPTIMIZE_TIMEOUT_MS,
    )

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text : ''

    if (!text) {
      return {
        optimizedPrompt: rawPrompt,
        explanation: '优化结果为空，已返回原始提示词。',
      }
    }

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; explanation?: string }
        if (parsed.optimizedPrompt && parsed.explanation) {
          return {
            optimizedPrompt: parsed.optimizedPrompt,
            explanation: parsed.explanation,
          }
        }
      }
    } catch {
      // JSON parse failed, fall through
    }

    return {
      optimizedPrompt: rawPrompt,
      explanation: '优化结果格式异常，已返回原始提示词。',
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('超时')) {
      return {
        optimizedPrompt: rawPrompt,
        explanation: '优化请求超时，请重试。已返回原始提示词。',
      }
    }

    return {
      optimizedPrompt: rawPrompt,
      explanation: `优化失败：${error instanceof Error ? error.message : '未知错误'}。已返回原始提示词。`,
    }
  }
}
