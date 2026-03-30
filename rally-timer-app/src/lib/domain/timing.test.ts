import { describe, it, expect } from 'vitest'
import { calculateStageTime } from './timing'

describe('calculateStageTime', () => {
	it('returns elapsed ms between start and finish', () => {
		const starts = [1000]
		const finishes = [5000]
		expect(calculateStageTime(starts, finishes)).toBe(4000)
	})
})
