import { today } from './date'

describe('today', () => {
  it('YYYY-MM-DD 形式の文字列を返す', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('JST の今日の日付を返す', () => {
    // UTC 2026-03-25 15:00:00 = JST 2026-03-26 00:00:00
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-25T15:00:00Z'))
    expect(today()).toBe('2026-03-26')
    vi.useRealTimers()
  })
})
