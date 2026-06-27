import { describe, it, expect } from 'vitest';
import { estimateDnfTime } from './dnfEstimation';

const r = (driver_tag: string, stage_id: number, elapsed_ms: number) => ({
	driver_tag,
	stage_id,
	elapsed_ms
});

describe('estimateDnfTime', () => {
	it('estimates time using median ratio of driver speed vs field', () => {
		const results = [
			// Stage 1: Peter 40s, Kristoffer 50s → ratio 0.80
			r('peter', 1, 40000),
			r('kristoffer', 1, 50000),
			// Stage 2: Peter 30s, Kristoffer 40s → ratio 0.75
			r('peter', 2, 30000),
			r('kristoffer', 2, 40000),
			// Target Stage 3 (DNF): Kristoffer 60s only
			r('kristoffer', 3, 60000)
		];
		// Median ratio: median(0.80, 0.75) = 0.775; field median on stage 3 = 60000
		// Estimate: round(0.775 * 60000) = 46500
		expect(estimateDnfTime('peter', 3, results)).toBe(46500);
	});

	it('uses median across multiple reference drivers', () => {
		const results = [
			// Stage 1: Peter 45s vs A:50s, B:50s → field median 50s, ratio 0.90
			r('peter', 1, 45000),
			r('a', 1, 50000),
			r('b', 1, 50000),
			// Target Stage 2: A:60s, B:60s → field median 60s
			r('a', 2, 60000),
			r('b', 2, 60000)
		];
		// Single ratio 0.90; estimate = round(0.90 * 60000) = 54000
		expect(estimateDnfTime('peter', 2, results)).toBe(54000);
	});

	it('returns null when driver has no known results on other stages', () => {
		const results = [r('kristoffer', 1, 50000)];
		expect(estimateDnfTime('peter', 1, results)).toBeNull();
	});

	it('returns null when target stage has no other drivers', () => {
		const results = [r('peter', 1, 40000)];
		expect(estimateDnfTime('peter', 2, results)).toBeNull();
	});
});
