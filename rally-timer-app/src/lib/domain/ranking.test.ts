import { describe, it, expect } from 'vitest'
import { rankTimes } from './ranking'

describe('rankTimes', () => {
  it('returns empty array for no entries', () => {
    expect(rankTimes([])).toEqual([])
  })

  it('single entry gets position 1, delta_p1 0, delta_prev null', () => {
    expect(rankTimes([210000])).toEqual([
      { position: 1, delta_p1: 0, delta_prev: null }
    ])
  })

  it('assigns sequential positions', () => {
    const result = rankTimes([210000, 218000, 225000])
    expect(result.map((r) => r.position)).toEqual([1, 2, 3])
  })

  it('delta_p1 is the gap to P1 for every driver', () => {
    const result = rankTimes([210000, 218000, 225000])
    expect(result[0].delta_p1).toBe(0)
    expect(result[1].delta_p1).toBe(8000)
    expect(result[2].delta_p1).toBe(15000)
  })

  it('delta_prev is the gap to the immediately preceding driver, null for P1', () => {
    const result = rankTimes([210000, 218000, 225000])
    expect(result[0].delta_prev).toBeNull()
    expect(result[1].delta_prev).toBe(8000)  // same as delta_p1 when P2 follows P1
    expect(result[2].delta_prev).toBe(7000)  // 225000 - 218000, different from delta_p1
  })

  // Norway SS1 Group A: Alice wins the stage
  it('Norway SS1 Group A — Alice P1, Diana P2', () => {
    const result = rankTimes([210000, 218000])
    expect(result[0]).toEqual({ position: 1, delta_p1: 0, delta_prev: null })
    expect(result[1]).toEqual({ position: 2, delta_p1: 8000, delta_prev: 8000 })
  })

  // Norway overall Group A: Diana wins despite losing SS1 (total time is what ranks)
  it('Norway overall Group A — Diana P1 on total, Alice P2', () => {
    // Diana total: 218000+205000=423000  Alice total: 210000+230000=440000
    const result = rankTimes([423000, 440000])
    expect(result[0]).toEqual({ position: 1, delta_p1: 0, delta_prev: null })
    expect(result[1]).toEqual({ position: 2, delta_p1: 17000, delta_prev: 17000 })
  })
})
