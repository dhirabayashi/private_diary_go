import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { usePageParam } from './usePageParam'

const createWrapper = (initialPath = '/') => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries: [initialPath] }, children)
  return { wrapper }
}

describe('usePageParam', () => {
  it('page パラメータなしのとき 1 を返す', () => {
    const { wrapper } = createWrapper('/')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(1)
  })

  it('?page=2 のとき 2 を返す', () => {
    const { wrapper } = createWrapper('/?page=2')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(2)
  })

  it('?page=abc（不正値）のとき 1 にフォールバックする', () => {
    const { wrapper } = createWrapper('/?page=abc')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(1)
  })

  it('?page=0 のとき 1 にフォールバックする', () => {
    const { wrapper } = createWrapper('/?page=0')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(1)
  })

  it('?page=-1 のとき 1 にフォールバックする', () => {
    const { wrapper } = createWrapper('/?page=-1')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(1)
  })

  it('?page=2.9（小数）のとき 2（切り捨て）を返す', () => {
    const { wrapper } = createWrapper('/?page=2.9')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    expect(result.current.page).toBe(2)
  })

  it('setPage(3) で URL に page=3 が設定される', () => {
    const { wrapper } = createWrapper('/')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    act(() => result.current.setPage(3))
    expect(result.current.page).toBe(3)
  })

  it('setPage(1) で URL から page キーが削除される', () => {
    const { wrapper } = createWrapper('/?page=3')
    const { result } = renderHook(() => usePageParam(), { wrapper })
    act(() => result.current.setPage(1))
    expect(result.current.page).toBe(1)
  })
})
