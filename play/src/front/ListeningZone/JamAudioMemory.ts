import { z } from "zod";
import type { JamAudioMemory } from "./JamAudioSession";

const MemorySchema = z.object({
    listening: z.string().optional().catch(undefined),
    sharing: z.object({ spaceName: z.string(), deviceId: z.string() }).optional().catch(undefined),
});

/** Reads what the browser kept of the Jam audio. Whatever it cannot make sense of is dropped: the user starts afresh. */
export function parseJamAudioMemory(raw: string | null): JamAudioMemory {
    if (raw === null) {
        return {};
    }
    try {
        const parsed = MemorySchema.safeParse(JSON.parse(raw));
        if (!parsed.success) {
            return {};
        }
        const { listening, sharing } = parsed.data;
        return { ...(listening !== undefined && { listening }), ...(sharing !== undefined && { sharing }) };
    } catch {
        return {};
    }
}
