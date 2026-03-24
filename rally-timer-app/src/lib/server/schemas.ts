import { z } from 'zod';

export const idParam = z
	.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
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

export const rallyCreateSchema = z.object({
	name: z
		.string()
		.min(1)
		.max(120)
		.transform((s) => s.trim())
});

export const rallyDriverAddSchema = z.object({
	driver_id: idParam
});

export const tagParamSchema = z
	.string()
	.min(1)
	.max(50)
	.transform((s) => s.trim());

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
	stage_id: idParam.nullable()
});

export type DriverCreateInput = z.infer<typeof driverCreateSchema>;
export type RallyCreateInput = z.infer<typeof rallyCreateSchema>;
export type RallyDriverAddInput = z.infer<typeof rallyDriverAddSchema>;
export type GateRegisterInput = z.infer<typeof gateRegisterSchema>;
export type GateEventInput = z.infer<typeof gateEventSchema>;
export type GateSyncInput = z.infer<typeof gateSyncSchema>;
