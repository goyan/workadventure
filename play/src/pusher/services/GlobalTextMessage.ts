import { globalTextMessageSchema, type textMessageSenderSchema } from "@workadventure/shared-utils";
import type { z } from "zod";

export function identifyGlobalTextMessage(content: string, sender: z.infer<typeof textMessageSenderSchema>): string {
    let delta;
    try {
        delta = globalTextMessageSchema.omit({ sender: true }).parse(JSON.parse(content));
    } catch {
        // Legacy plain text is represented as an insert, never as HTML.
        delta = { ops: [{ insert: `${content}\n` }] };
    }
    return JSON.stringify({ ...delta, sender });
}
