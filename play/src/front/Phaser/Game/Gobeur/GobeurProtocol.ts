import { z } from "zod";
import { GobeurLevel } from "@workadventure/map-editor";

export const GOBEUR_EVENT_PREFIX = "infogene.gobeur.";
export const GOBEUR_POS_INTERVAL_MS = 200;
export const GOBEUR_STATE_INTERVAL_MS = 5_000;
export const GOBEUR_MASTER_TIMEOUT_MS = 5_000;

export type GobeurDirection = "down" | "left" | "right" | "up";

const finite = z.number().finite();

const GobeurStartSchema = z.object({
    kind: z.literal("start"),
    gameId: z.string(),
    entityId: z.string(),
    masterUuid: z.string(),
    startedAt: finite,
    endsAt: finite,
    level: GobeurLevel,
    prisonAreaId: z.string(),
    fallbackSafeAreaId: z.string().optional(),
    players: z.array(z.string()),
});

const GobeurPosSchema = z.object({
    kind: z.literal("pos"),
    gameId: z.string(),
    x: finite,
    y: finite,
    direction: z.enum(["down", "left", "right", "up"]),
    at: finite,
});

const GobeurStateSchema = z.object({
    kind: z.literal("state"),
    gameId: z.string(),
    survivors: z.array(z.string()),
    /** In order of capture. */
    caught: z.array(z.string()),
    left: z.array(z.string()),
    endsAt: finite,
});

const GobeurCaughtSchema = z.object({
    kind: z.literal("caught"),
    gameId: z.string(),
    uuid: z.string(),
});

const GobeurEndSchema = z.object({
    kind: z.literal("end"),
    gameId: z.string(),
    reason: z.enum(["allCaught", "timeUp", "stopped", "interrupted"]),
    ranking: z.array(
        z.object({
            uuid: z.string(),
            status: z.enum(["survivor", "caught", "left"]),
        }),
    ),
});

const GobeurMessageSchema = z.discriminatedUnion("kind", [
    GobeurStartSchema,
    GobeurPosSchema,
    GobeurStateSchema,
    GobeurCaughtSchema,
    GobeurEndSchema,
]);

export type GobeurStartMessage = z.infer<typeof GobeurStartSchema>;
export type GobeurPosMessage = z.infer<typeof GobeurPosSchema>;
export type GobeurStateMessage = z.infer<typeof GobeurStateSchema>;
export type GobeurCaughtMessage = z.infer<typeof GobeurCaughtSchema>;
export type GobeurEndMessage = z.infer<typeof GobeurEndSchema>;
export type GobeurMessage = z.infer<typeof GobeurMessageSchema>;

export function encodeGobeurMessage(m: GobeurMessage): { name: string; data: unknown } {
    return { name: GOBEUR_EVENT_PREFIX + m.kind, data: m };
}

export function decodeGobeurMessage(name: string, data: unknown): GobeurMessage | undefined {
    if (!name.startsWith(GOBEUR_EVENT_PREFIX)) {
        return undefined;
    }
    const parsed = GobeurMessageSchema.safeParse(data);
    if (!parsed.success || name.slice(GOBEUR_EVENT_PREFIX.length) !== parsed.data.kind) {
        return undefined;
    }
    return parsed.data;
}

/** Returns the start message with the smallest startedAt, ties broken by lexicographic gameId. */
export function olderStart(a: GobeurStartMessage, b: GobeurStartMessage): GobeurStartMessage {
    if (a.startedAt !== b.startedAt) {
        return a.startedAt < b.startedAt ? a : b;
    }
    return a.gameId <= b.gameId ? a : b;
}
