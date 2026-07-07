// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { InfiniteScrollTrigger } from '../InfiniteScrollTrigger'

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void

// 실제 IntersectionObserver는 jsdom에 없으므로 관찰/해제 호출을 기록하는 목으로 대체.
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []
  callback: ObserverCallback
  options?: IntersectionObserverInit
  observedElements: Element[] = []
  disconnected = false

  constructor(callback: ObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    MockIntersectionObserver.instances.push(this)
  }
  observe(el: Element) {
    this.observedElements.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = []
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InfiniteScrollTrigger', () => {
  it('교차(isIntersecting: true) 시 onIntersect 호출', () => {
    const onIntersect = vi.fn()
    render(<InfiniteScrollTrigger onIntersect={onIntersect} />)

    const observer = MockIntersectionObserver.instances[0]
    observer.callback([{ isIntersecting: true } as IntersectionObserverEntry])

    expect(onIntersect).toHaveBeenCalledTimes(1)
  })

  it('교차하지 않으면(isIntersecting: false) onIntersect 미호출', () => {
    const onIntersect = vi.fn()
    render(<InfiniteScrollTrigger onIntersect={onIntersect} />)

    const observer = MockIntersectionObserver.instances[0]
    observer.callback([{ isIntersecting: false } as IntersectionObserverEntry])

    expect(onIntersect).not.toHaveBeenCalled()
  })

  it('disabled: true면 IntersectionObserver를 생성하지 않음 (관찰 안 함)', () => {
    const onIntersect = vi.fn()
    render(<InfiniteScrollTrigger onIntersect={onIntersect} disabled />)

    expect(MockIntersectionObserver.instances).toHaveLength(0)
  })

  it('rootMargin: 200px 옵션으로 관찰 — 바닥 도달 전 미리 로드', () => {
    const onIntersect = vi.fn()
    render(<InfiniteScrollTrigger onIntersect={onIntersect} />)

    const observer = MockIntersectionObserver.instances[0]
    expect(observer.options?.rootMargin).toBe('200px')
  })

  it('언마운트 시 observer.disconnect() 호출', () => {
    const onIntersect = vi.fn()
    const { unmount } = render(<InfiniteScrollTrigger onIntersect={onIntersect} />)

    const observer = MockIntersectionObserver.instances[0]
    unmount()

    expect(observer.disconnected).toBe(true)
  })
})
