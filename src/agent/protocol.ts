import { z } from 'zod'

import { deckDraftSchema } from './deckDraft'

export const aiClientContextSchema = z.object({
  locale: z.string().min(1),
  timezone: z.string().min(1),
  surface: z.literal('editor'),
})

export const aiTurnDispositionSchema = z.object({
  candidateId: z.string().min(1),
  status: z.enum(['applied', 'discarded']),
})

export const htmlPptAudienceSchema = z.enum(['engineers', 'executives', 'students', 'consumers', 'general'])
export const htmlPptFormatSchema = z.enum(['live', 'pdf', 'xhs', 'standalone'])

export const htmlPptConfigSchema = z.object({
  audience: htmlPptAudienceSchema,
  format: htmlPptFormatSchema,
  themeName: z.string().min(1),
  fullDeckName: z.string().min(1),
  slideCountHint: z.number().int().positive().optional(),
  layoutNames: z.array(z.string().min(1)).optional(),
  animationNames: z.array(z.string().min(1)).optional(),
  includeNotes: z.boolean().default(true),
  preserveRuntime: z.boolean().default(true),
})

export const extractedAssetSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  kind: z.enum(['image', 'full-text']),
  path: z.string().min(1),
})

export const htmlPptAssetSchema = z.object({
  assetId: z.string().min(1).optional(),
  fileName: z.string().min(1),
  path: z.string().min(1).optional(),
  contentType: z.string().min(1).optional(),
  ext: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  usability: z.enum(['usable', 'ignored']).optional(),
  reason: z.string().optional(),
  referenceText: z.object({
    status: z.enum(['extracted', 'unsupported', 'failed']),
    excerpt: z.string(),
    charCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    reason: z.string().optional(),
  }).optional(),
  extractedAssets: z.array(extractedAssetSchema).optional(),
})

export const artifactRefSchema = z.object({
  artifactId: z.string().min(1),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
})

export const htmlAgentOperationSchema = z.enum(['generate', 'extend_remaining'])

export const inputReplyAnswerSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().min(1),
  text: z.string().optional(),
})

export const inputReplySchema = z.object({
  inputId: z.string().min(1),
  answers: z.array(inputReplyAnswerSchema).min(1),
})

export const pendingInputOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  requiresFreeText: z.boolean().optional(),
})

export const pendingInputQuestionSchema = z.object({
  id: z.string().min(1),
  header: z.string().min(1),
  question: z.string().min(1),
  options: z.array(pendingInputOptionSchema).min(1),
  allowFreeText: z.boolean().optional(),
  freeTextLabel: z.string().min(1).nullable().optional(),
})

export const pendingTextInputSchema = z.object({
  kind: z.literal('text'),
  inputId: z.string().min(1),
  responseId: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  submitLabel: z.string().min(1).optional(),
})

export const pendingFormInputSchema = z.object({
  kind: z.literal('form'),
  inputId: z.string().min(1),
  responseId: z.string().min(1),
  title: z.string().min(1),
  submitLabel: z.string().min(1),
  questions: z.array(pendingInputQuestionSchema).min(1),
})

export const pendingInputSchema = z.discriminatedUnion('kind', [
  pendingTextInputSchema,
  pendingFormInputSchema,
])

export const aiTurnRequestSchema = z.object({
  sessionId: z.string().min(1),
  documentId: z.string().min(1),
  message: z.string(),
  skillId: z.string().min(1),
  currentDeckHtml: z.string().min(1),
  currentDeckHash: z.string().min(1),
  clientContext: aiClientContextSchema,
  generationMode: z.enum(['from-scratch', 'from-current']),
  lastCandidateDisposition: aiTurnDispositionSchema.optional(),
  htmlPpt: htmlPptConfigSchema.optional(),
  htmlAgentOperation: htmlAgentOperationSchema.optional(),
  targetSlideCount: z.number().int().positive().optional(),
  currentSlideCount: z.number().int().positive().optional(),
  selectedElement: z.object({
    slideId: z.string().min(1),
    selector: z.string().min(1),
    elementTag: z.string().min(1).optional(),
    elementText: z.string().optional(),
  }).optional(),
  messageAssetIds: z.array(z.string().min(1)).optional(),
  inputReply: inputReplySchema.optional(),
}).superRefine((value, context) => {
  if (value.message.trim().length === 0 && !value.inputReply) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'message or inputReply is required',
      path: ['message'],
    })
  }
})

export const pptxExportRequestSchema = z.object({
  sessionId: z.string().min(1),
  documentId: z.string().min(1),
  currentDeckHtml: z.string().min(1),
  currentDeckHash: z.string().min(1),
  clientContext: aiClientContextSchema,
})

export const agentSkillSearchModeSchema = z.enum(['off', 'auto', 'required'])
export const agentSkillWorkflowSchema = z.enum(['deck', 'html_agent'])

export const agentSkillSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  searchMode: agentSkillSearchModeSchema,
  workflow: agentSkillWorkflowSchema,
})

export const slideMetaSchema = z.object({
  slideId: z.string().min(1),
  title: z.string().min(1),
  nodeCount: z.number().int().nonnegative(),
})

export const candidateSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  domain: z.string().min(1),
  snippet: z.string(),
})

export const candidateRunMetaSchema = z.object({
  skillId: z.string().min(1),
  model: z.string().min(1),
  usedWebSearch: z.boolean(),
  searchMode: agentSkillSearchModeSchema,
  isFallback: z.boolean().optional(),
  jobId: z.string().min(1).optional(),
  sandboxId: z.string().min(1).optional(),
})

export const htmlCandidateLayoutWarningSchema = z.object({
  code: z.string().min(1),
  severity: z.literal('warning'),
  slideId: z.string().min(1).optional(),
  slideIndex: z.number().int().positive().optional(),
  message: z.string().min(1),
})

export const deckCandidateSchema = z.object({
  candidateId: z.string().min(1),
  summary: z.string().min(1),
  deckDraft: deckDraftSchema,
  compiledHtml: z.string().min(1),
  slideMeta: z.array(slideMetaSchema).min(1),
  sources: z.array(candidateSourceSchema),
  artifactRefs: z.object({
    html: artifactRefSchema.optional(),
  }).optional(),
  runMeta: candidateRunMetaSchema,
})

export const htmlCandidateSchema = z.object({
  candidateId: z.string().min(1),
  summary: z.string().min(1),
  html: z.string().min(1),
  previewMeta: z.object({
    title: z.string().min(1),
    slideCount: z.number().int().positive(),
    generatedSlideCount: z.number().int().positive().optional(),
    targetSlideCount: z.number().int().positive().optional(),
    isPartial: z.boolean().optional(),
    layoutWarnings: z.array(htmlCandidateLayoutWarningSchema).optional(),
  }),
  sources: z.array(candidateSourceSchema),
  artifactRefs: z.object({
    html: artifactRefSchema.optional(),
  }).optional(),
  runMeta: candidateRunMetaSchema,
})

export const htmlPptStateSchema = z.object({
  initialMessage: z.string().min(1).optional(),
  htmlPpt: htmlPptConfigSchema.optional(),
  targetSlideCount: z.number().int().positive().optional(),
  lastInputReply: inputReplySchema.optional(),
  imageFolderPath: z.string().min(1).optional(),
  scannedAssets: z.array(htmlPptAssetSchema).optional(),
  uploadedAssets: z.array(htmlPptAssetSchema).optional(),
})

export const sessionSnapshotSchema = z.object({
  lastAssistantText: z.string().min(1).optional(),
  candidate: z.union([deckCandidateSchema, htmlCandidateSchema]).optional(),
  pendingInput: pendingInputSchema.optional(),
  htmlPptState: htmlPptStateSchema.optional(),
})

export const agentTurnEventSchema = z.union([
  z.object({
    type: z.literal('status'),
    phase: z.enum(['queued', 'searching', 'drafting', 'finalizing']),
    label: z.string().min(1),
  }),
  z.object({
    type: z.literal('assistant_delta'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('assistant_done'),
    text: z.string(),
  }),
  pendingTextInputSchema.extend({
    type: z.literal('input_required'),
  }),
  pendingFormInputSchema.extend({
    type: z.literal('input_required'),
  }),
  z.object({
    type: z.literal('candidate_ready'),
    ...deckCandidateSchema.shape,
  }),
  z.object({
    type: z.literal('html_candidate_ready'),
    ...htmlCandidateSchema.shape,
  }),
  z.object({
    type: z.literal('error'),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('done'),
  }),
])

export const pptxExportEventSchema = z.union([
  z.object({
    type: z.literal('status'),
    phase: z.enum(['queued', 'drafting', 'finalizing']),
    label: z.string().min(1),
  }),
  z.object({
    type: z.literal('assistant_done'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('pptx_export_ready'),
    summary: z.string().min(1),
    artifactRef: artifactRefSchema,
    downloadUrl: z.string().min(1),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string().min(1),
  }),
  z.object({
    type: z.literal('done'),
  }),
])

export const optimizePromptRequestSchema = z.object({
  prompt: z.string().min(1),
  context: z.object({
    generationMode: z.enum(['from-scratch', 'from-current']).optional(),
    hasUploadedAssets: z.boolean().optional(),
  }).optional(),
})

export const optimizePromptResponseSchema = z.object({
  optimizedPrompt: z.string().min(1),
  explanation: z.string(),
})

export type AiTurnRequest = z.infer<typeof aiTurnRequestSchema>
export type AgentTurnEvent = z.infer<typeof agentTurnEventSchema>
export type PptxExportRequest = z.infer<typeof pptxExportRequestSchema>
export type PptxExportEvent = z.infer<typeof pptxExportEventSchema>
export type AgentSkill = z.infer<typeof agentSkillSchema>
export type AgentSkillSearchMode = z.infer<typeof agentSkillSearchModeSchema>
export type AgentSkillWorkflow = z.infer<typeof agentSkillWorkflowSchema>
export type AgentSessionSnapshot = z.infer<typeof sessionSnapshotSchema>
export type HtmlPptConfig = z.infer<typeof htmlPptConfigSchema>
export type HtmlCandidateLayoutWarning = z.infer<typeof htmlCandidateLayoutWarningSchema>
export type ExtractedAsset = z.infer<typeof extractedAssetSchema>
export type HtmlPptAsset = z.infer<typeof htmlPptAssetSchema>
export type HtmlPptState = z.infer<typeof htmlPptStateSchema>
export type PendingInput = z.infer<typeof pendingInputSchema>
export type InputReply = z.infer<typeof inputReplySchema>
export type OptimizePromptRequest = z.infer<typeof optimizePromptRequestSchema>
export type OptimizePromptResponse = z.infer<typeof optimizePromptResponseSchema>
