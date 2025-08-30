import * as z from 'zod';

export const GateEvent = z.object({
  id: z.number(),
  stage_name: z.string(),
  rally_name: z.string(),
  timestamp: z.number(),
});
export type GateEventType = z.infer<typeof GateEvent>;
export const NewGateEvent = z.object({
  timestamp: z.number(),
});

export const BlipEvent = z.object({
  id: z.number(),
  stage_name: z.string(),
  rally_name: z.string(),
  timestamp: z.number(),
  tag: z.string(),
});
export type BlipEventType = z.infer<typeof BlipEvent>;
export const NewBlipEvent = z.object({
  timestamp: z.number(),
  tag: z.string(),
});

export const Driver = z.object({
  id: z.number(),
  name: z.string(),
});
export type DriverType = z.infer<typeof Driver>;
export const NewDriver = z.object({
  name: z.string(),
});
