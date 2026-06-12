import { z } from 'zod';

export const idParam = z
	.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)])
	.transform(Number);

export const driverCreateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(100)
		.transform((s) => s.trim()),
	class_id: idParam,
	tag: z
		.string()
		.min(1)
		.max(50)
		.transform((s) => s.trim())
});

export const driverActiveSchema = z.object({
	active: z.boolean()
});

export const classCreateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(100)
		.transform((s) => s.trim()),
	start_priority: z.number().int().optional().default(0)
});

export const classUpdateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(100)
		.transform((s) => s.trim()),
	start_priority: z.number().int().optional()
});

export const championshipCreateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(120)
		.transform((s) => s.trim())
});

export const championshipUpdateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(120)
		.transform((s) => s.trim())
});

export const submitRallySchema = z.object({
	name: z
		.string()
		.min(1)
		.max(120)
		.transform((s) => s.trim()),
	championship_ids: z.array(z.string().uuid()).min(1)
});

export const tagParamSchema = z
	.string()
	.min(1)
	.max(50)
	.transform((s) => s.trim());

export const finishUpdateSchema = z
	.object({
		timestamp: z.number().int().positive().optional(),
		penalty_ms: z.number().nonnegative().finite().transform(Math.round).optional()
	})
	.refine((v) => v.timestamp !== undefined || v.penalty_ms !== undefined, {
		message: 'timestamp or penalty_ms required'
	});

export const gateRegisterSchema = z.object({
	id: z.string().uuid(),
	name: z.string().max(100).optional()
});

export const gateEventSchema = z.object({
	gate_id: z.string().uuid(),
	timestamp_ms: z.number().int().nonnegative(),
	tag: z
		.string()
		.min(1)
		.max(50)
		.transform((s) => s.trim()),
	rssi: z.number().int().optional()
});

export const gateSyncSchema = z.object({
	events: z.array(
		gateEventSchema.extend({
			client_id: z.string().uuid().optional()
		})
	)
});

export const gateAssignSchema = z.object({
	stage_id: idParam.nullable().optional(),
	name: z.string().nullable().optional()
});

export const rallycrossConfigSchema = z.object({
	gate_id: z.string().uuid().nullable().optional(),
	cooldown_ms: z
		.number()
		.int()
		.nonnegative()
		.max(10 * 60 * 1000)
		.optional(),
	max_per_heat: z.number().int().min(1).max(20).optional(),
	required_laps: z.number().int().min(1).max(50).optional()
});

export const heatCreateSchema = z.object({
	driver_ids: z.array(z.number().int().positive()).min(1)
});

export const trainingConfigSchema = z.object({
	gate_id: z.string().uuid().nullable().optional(),
	cooldown_ms: z
		.number()
		.int()
		.nonnegative()
		.max(10 * 60 * 1000)
		.optional()
});

export const heatManualCloseSchema = z.object({
	finish_order: z.array(z.number().int().positive()).min(1)
});

export type DriverCreateInput = z.infer<typeof driverCreateSchema>;
export type DriverActiveInput = z.infer<typeof driverActiveSchema>;
export type GateRegisterInput = z.infer<typeof gateRegisterSchema>;
export type GateEventInput = z.infer<typeof gateEventSchema>;
export type GateSyncInput = z.infer<typeof gateSyncSchema>;
export type ClassCreateInput = z.infer<typeof classCreateSchema>;
export type ClassUpdateInput = z.infer<typeof classUpdateSchema>;
export type ChampionshipCreateInput = z.infer<typeof championshipCreateSchema>;
export type ChampionshipUpdateInput = z.infer<typeof championshipUpdateSchema>;
export const pageUpdateSchema = z.object({
	content: z.string().min(1).max(100000)
});

export type SubmitRallyInput = z.infer<typeof submitRallySchema>;
export type PageUpdateInput = z.infer<typeof pageUpdateSchema>;
export const settingsSchema = z.object({
	pinned_view: z.enum(['rally', 'rallycross', 'training']).nullable()
});

export type RallycrossConfigInput = z.infer<typeof rallycrossConfigSchema>;
export type TrainingConfigInput = z.infer<typeof trainingConfigSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
