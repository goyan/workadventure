import { z } from "zod";

/**
 * A room event, not a player variable: the server only sends a player's variables to the players whose viewport sees
 * them (see PositionNotifier in the back), and a tamed animal leaves its nest, where the others still look for it.
 * A room event reaches every player of the room, its sender set by the server.
 */
export const JUNGLE_COMPANION_EVENT = "infogene.jungle.companion";
/** A master tells the room about its companion this often: a player who just arrived knows it within that time. */
export const JUNGLE_COMPANION_ANNOUNCE_MS = 5_000;
/**
 * A claim not announced again for that long is over: its master is gone without a word (a crash, a lost network; a
 * departure or a reload says it). Longer than a minute: the timers of a tab hidden for long run once a minute.
 */
export const JUNGLE_COMPANION_EXPIRY_MS = 75_000;

const JungleCompanionMessageSchema = z.object({
    /** The id of the animal (`jungle:<tree id>`), null once released. */
    animal: z.string().startsWith("jungle:").max(256).nullable(),
    /** When the animal was tamed, on the server clock: the first claim wins. */
    since: z.number().finite(),
});

export type JungleCompanionMessage = z.infer<typeof JungleCompanionMessageSchema>;

export interface JungleCompanionClaim {
    /** The user id of the master (the sender id set by the server). */
    owner: number;
    animal: string;
    since: number;
}

export function encodeJungleCompanion(message: JungleCompanionMessage): { name: string; data: unknown } {
    return { name: JUNGLE_COMPANION_EVENT, data: message };
}

/** Returns undefined for any foreign event name or invalid payload. */
export function decodeJungleCompanion(name: string, data: unknown): JungleCompanionMessage | undefined {
    if (name !== JUNGLE_COMPANION_EVENT) return undefined;
    const parsed = JungleCompanionMessageSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
}

/**
 * Who each animal follows: the first claim (smallest `since`), the smaller user id on the same instant, and one
 * animal per player (the first they claimed). The same on every client that got the same claims.
 */
export function jungleCompanionOwners(claims: Iterable<JungleCompanionClaim>): Map<string, number> {
    const sorted = [...claims].sort((a, b) => a.since - b.since || a.owner - b.owner);
    const owners = new Map<string, number>();
    const masters = new Set<number>();
    for (const claim of sorted) {
        if (owners.has(claim.animal) || masters.has(claim.owner)) continue;
        owners.set(claim.animal, claim.owner);
        masters.add(claim.owner);
    }
    return owners;
}

/** The last claim of each other player, on the clock of this page, until it expires. */
export class JungleCompanionClaims {
    private readonly received = new Map<number, { animal: string; since: number; receivedAt: number }>();

    public receive(senderId: number, message: JungleCompanionMessage, nowMs: number): void {
        if (message.animal === null) {
            this.received.delete(senderId);
            return;
        }
        this.received.set(senderId, { animal: message.animal, since: message.since, receivedAt: nowMs });
    }

    /** The claims still alive, by user id. */
    public claims(nowMs: number): JungleCompanionClaim[] {
        const claims: JungleCompanionClaim[] = [];
        for (const [owner, claim] of this.received) {
            if (nowMs - claim.receivedAt > JUNGLE_COMPANION_EXPIRY_MS) {
                this.received.delete(owner);
                continue;
            }
            claims.push({ owner, animal: claim.animal, since: claim.since });
        }
        return claims.sort((a, b) => a.owner - b.owner);
    }
}
