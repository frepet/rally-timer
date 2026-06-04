import * as z from 'zod';

export const FinishEvent = z.object({
	id: z.number(),
	stage_name: z.string(),
	timestamp: z.number(),
	tag: z.string()
});
export type FinishEventType = z.infer<typeof FinishEvent>;
export const NewFinishEvent = z.object({
	timestamp: z.number(),
	tag: z.string()
});

export const Driver = z.object({
	id: z.number(),
	name: z.string()
});
export type DriverType = z.infer<typeof Driver>;
export const NewDriver = z.object({
	name: z.string()
});

export type BundleResponse = {
	drivers: {
		id: number;
		uuid: string;
		name: string;
		rfid_tag: string;
		class_id: number;
		class_name: string;
		active: boolean;
	}[];
	stages: {
		id: number;
		name: string;
		is_closed: boolean;
	}[];
	start_events: {
		id: number;
		stage_id: number;
		driver_id: number;
		ts: number;
	}[];
	finish_events: {
		id: number;
		stage_id: number;
		ts: number;
		tag: string;
		penalty_ms: number;
	}[];
};

export const Gate = z.object({
	id: z.string().uuid(),
	name: z.string().nullable(),
	last_seen: z.number(),
	stage_id: z.number().nullable(),
	stage_name: z.string().nullable().optional(),
	created_at: z.number()
});
export type GateType = z.infer<typeof Gate>;
