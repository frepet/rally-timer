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

export const blipCreateSchema = z.object({
	stage_id: idParam,
	tag: z
		.string()
		.min(1)
		.max(50)
		.transform((s) => s.trim())
});

export const tagParamSchema = z
	.string()
	.min(1)
	.max(50)
	.transform((s) => s.trim());

export type DriverCreateInput = z.infer<typeof driverCreateSchema>;
export type RallyCreateInput = z.infer<typeof rallyCreateSchema>;
export type RallyDriverAddInput = z.infer<typeof rallyDriverAddSchema>;
export type BlipCreateInput = z.infer<typeof blipCreateSchema>;
