export type EditableNodeKind = 'text' | 'image' | 'component'

export function getNodeKindLabel(kind: EditableNodeKind): string {
  if (kind === 'text') {
    return '文字'
  }
  if (kind === 'image') {
    return '图片'
  }
  return '组件'
}

export function truncateNodeLabel(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return '未命名节点'
  }

  return normalized.length > 32 ? `${normalized.slice(0, 29)}...` : normalized
}
