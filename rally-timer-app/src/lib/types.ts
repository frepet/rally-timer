import * as z from 'zod';

export const Passing = z.object({
  id: z.number(),
  gate_id: z.string(),
  timestamp: z.number(),
});

export type PassingType = z.infer<typeof Passing>;

export const NewPassing = z.object({
  timestamp: z.number(),
});

