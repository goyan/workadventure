import { z } from "zod";

export const WAVE_EVENT_NAME = "infogene.wave";

const WaveMessageSchema = z.object({
    targetUuid: z.string().min(1),
    at: z.number().finite(),
});

export type WaveMessage = z.infer<typeof WaveMessageSchema>;

export function encodeWave(message: WaveMessage): { name: string; data: unknown } {
    return { name: WAVE_EVENT_NAME, data: message };
}

/** Returns undefined for any foreign event name or invalid payload. */
export function decodeWave(name: string, data: unknown): WaveMessage | undefined {
    if (name !== WAVE_EVENT_NAME) {
        return undefined;
    }
    const parsed = WaveMessageSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}
