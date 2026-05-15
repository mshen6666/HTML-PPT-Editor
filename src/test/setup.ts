import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

if (typeof Element !== 'undefined' && typeof Element.prototype.getClientRects !== 'function') {
  Element.prototype.getClientRects = function getClientRects(): DOMRectList {
    const rect = this.getBoundingClientRect()
    return {
      0: rect,
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: function* iterator() {
        yield rect
      },
    } as DOMRectList
  }
}

if (typeof Node !== 'undefined' && typeof (Node.prototype as Node & { getClientRects?: () => DOMRectList }).getClientRects !== 'function') {
  ;(Node.prototype as Node & { getClientRects: () => DOMRectList; getBoundingClientRect: () => DOMRect }).getClientRects = function getClientRects(): DOMRectList {
    const rect = new DOMRect(0, 0, 0, 0)
    return {
      0: rect,
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: function* iterator() {
        yield rect
      },
    } as DOMRectList
  }
  ;(Node.prototype as Node & { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
}

if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    const rect = new DOMRect(0, 0, 0, 0)
    return {
      0: rect,
      length: 1,
      item: (index: number) => (index === 0 ? rect : null),
      [Symbol.iterator]: function* iterator() {
        yield rect
      },
    } as DOMRectList
  }
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
}

if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => document.body
}

if (typeof window !== 'undefined' && typeof window.localStorage?.getItem !== 'function') {
  const backingStore = new Map<string, string>()
  const memoryStorage: Storage = {
    get length() {
      return backingStore.size
    },
    clear() {
      backingStore.clear()
    },
    getItem(key: string) {
      return backingStore.has(key) ? backingStore.get(key) ?? null : null
    },
    key(index: number) {
      return Array.from(backingStore.keys())[index] ?? null
    },
    removeItem(key: string) {
      backingStore.delete(key)
    },
    setItem(key: string, value: string) {
      backingStore.set(key, value)
    },
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  })
}

afterEach(() => {
  cleanup()
  if (typeof window !== 'undefined' && typeof window.localStorage?.clear === 'function') {
    window.localStorage.clear()
  }
})
