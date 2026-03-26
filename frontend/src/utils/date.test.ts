import { today } from './date'

describe('today', () => {
  it('YYYY-MM-DD 形式の文字列を返す', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('未来の日付を返さない', () => {
    const result = today()
    const now = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })
    expect(result <= now).toBe(true)
  })
})
