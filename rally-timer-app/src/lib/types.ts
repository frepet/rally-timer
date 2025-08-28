import * as z from 'zod';

export const GateEvent = z.object({
  id: z.number(),
  gateId: z.string(),
  timestamp: z.number(),
});
export type GateEventType = z.infer<typeof GateEvent>;
export const NewGateEvent = z.object({
  timestamp: z.number(),
});

export const BlipEvent = z.object({
  id: z.number(),
  blipId: z.string(),
  timestamp: z.number(),
  tag: z.string(),
});
export type BlipEventType = z.infer<typeof BlipEvent>;
export const NewBlipEvent = z.object({
  timestamp: z.number(),
  tag: z.string(),
});

