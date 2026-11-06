import { z } from "zod";

export const KNOCK_EVENT_PREFIX = "infogene.knock.";

const finite = z.number().finite();

const KnockAnswerSchema = z.enum(["enter", "later"]);
export type KnockAnswer = z.infer<typeof KnockAnswerSchema>;

const KnockRequestSchema = z.object({
    kind: z.literal("request"),
    areaId: z.string(),
    visitorUuid: z.string(),
    visitorName: z.string(),
    at: finite,
});

const KnockAnswerMessageSchema = z.object({
    kind: z.literal("answer"),
    areaId: z.string(),
    visitorUuid: z.string(),
    answer: KnockAnswerSchema,
    answeredBy: z.string(),
    at: finite,
});

const KnockCancelSchema = z.object({
    kind: z.literal("cancel"),
    areaId: z.string(),
    visitorUuid: z.string(),
    at: finite,
});

const KnockMessageSchema = z.discriminatedUnion("kind", [
    KnockRequestSchema,
    KnockAnswerMessageSchema,
    KnockCancelSchema,
]);

export type KnockMessage = z.infer<typeof KnockMessageSchema>;

export function encodeKnockMessage(message: KnockMessage): { name: string; data: unknown } {
    return { name: KNOCK_EVENT_PREFIX + message.kind, data: message };
}

/** Returns undefined for any foreign event name, invalid payload, or name/kind mismatch. */
export function decodeKnockMessage(name: string, data: unknown): KnockMessage | undefined {
    if (!name.startsWith(KNOCK_EVENT_PREFIX)) {
        return undefined;
    }
    const parsed = KnockMessageSchema.safeParse(data);
    if (!parsed.success || name.slice(KNOCK_EVENT_PREFIX.length) !== parsed.data.kind) {
        return undefined;
    }
    return parsed.data;
}
