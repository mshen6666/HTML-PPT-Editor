import { describe, expect, it } from 'vitest'

import { getNodeKindLabel, truncateNodeLabel } from './editorLabels'

describe('editorLabels', () => {
  it('maps editable node kinds to inspector labels', () => {
    expect(getNodeKindLabel('text')).toBe('文字')
    expect(getNodeKindLabel('image')).toBe('图片')
    expect(getNodeKindLabel('component')).toBe('组件')
  })

  it('keeps compact node labels readable', () => {
    expect(truncateNodeLabel('短标题')).toBe('短标题')
    expect(truncateNodeLabel('')).toBe('未命名节点')
    expect(truncateNodeLabel('这是一个非常长的节点标题，需要在侧栏中被截断显示出来，因为内容太长')).toBe('这是一个非常长的节点标题，需要在侧栏中被截断显示出来，因为...')
  })
})
