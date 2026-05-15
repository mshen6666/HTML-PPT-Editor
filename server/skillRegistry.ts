import type { AgentSkill, AgentSkillSearchMode, AiTurnRequest } from '../src/agent/protocol'

const SEARCH_TRIGGER_PATTERN = /(\bsearch\b|\bfind\b|\blook up\b|最新|最近|今天|查一下|联网|趋势|current|today|latest)/i

export const AGENT_SKILLS: AgentSkill[] = [
  {
    id: 'html_ppt',
    label: 'HTML PPT',
    description: '原生 html-ppt HTML agent 工作流。',
    searchMode: 'off',
    workflow: 'html_agent',
  },
  {
    id: 'general_edit',
    label: '通用改写',
    description: '面向当前 deck 的通用重写与整理。',
    searchMode: 'auto',
    workflow: 'deck',
  },
  {
    id: 'condense_content',
    label: '压缩内容',
    description: '提炼长文案，收紧结构和篇幅。',
    searchMode: 'off',
    workflow: 'deck',
  },
  {
    id: 'make_more_visual',
    label: '更视觉化',
    description: '强化信息层级和画面感，不主动联网。',
    searchMode: 'off',
    workflow: 'deck',
  },
  {
    id: 'research_refresh',
    label: '研究补全',
    description: '自动联网搜索公开资料并补全内容。',
    searchMode: 'required',
    workflow: 'deck',
  },
]

export function listAgentSkills(): AgentSkill[] {
  return AGENT_SKILLS
}

export function getAgentSkill(skillId: string): AgentSkill {
  return AGENT_SKILLS.find((skill) => skill.id === skillId) ?? AGENT_SKILLS[0]
}

export function resolveSearchMode(request: Pick<AiTurnRequest, 'message' | 'skillId'>): AgentSkillSearchMode {
  const skill = getAgentSkill(request.skillId)
  if (skill.searchMode !== 'auto') {
    return skill.searchMode
  }

  return SEARCH_TRIGGER_PATTERN.test(request.message) ? 'auto' : 'off'
}

export function shouldUseWebSearch(request: Pick<AiTurnRequest, 'message' | 'skillId'>): boolean {
  return resolveSearchMode(request) !== 'off'
}
