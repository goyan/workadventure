import { z } from "zod";

/**
 * A room event, not a player variable: the server only sends a player's variables to the players whose viewport sees
 * them (see PositionNotifier in the back), and a tamed animal leaves its nest, where the others still look for it.
 * A room event reaches every player of the room, its sender set by the server.
 */
export const JUNGLE_COMPANION_EVENT = "infogene.jungle.companion";
/** A master tells the room about its companions this often: a player who just arrived knows them within that time. */
export const JUNGLE_COMPANION_ANNOUNCE_MS = 5_000;
/**
 * A claim not announced again for that long is over: its master is gone without a word (a crash, a lost network; a
 * departure or a reload says it). Longer than a minute: the timers of a tab hidden for long run once a minute.
 */
export const JUNGLE_COMPANION_EXPIRY_MS = 75_000;
/** How many companions a player may have. */
export const JUNGLE_MAX_COMPANIONS = 5;

const AnimalIdSchema = z.string().startsWith("jungle:").max(256);

const JungleCompanionSchema = z.object({
    /** The id of the animal: `jungle:<tree id>`. */
    animal: AnimalIdSchema,
    /** When the animal was tamed, on the server clock: the first claim of an animal wins. */
    since: z.number().finite(),
});

const JungleCompanionMessageSchema = z.object({
    /** Every companion of the sender: empty once they are all released. */
    companions: z.array(JungleCompanionSchema).max(JUNGLE_MAX_COMPANIONS),
});

/** What a client with one companion at most sends (the first version): still understood. */
const SingleCompanionMessageSchema = z.object({
    animal: AnimalIdSchema.nullable(),
    since: z.number().finite(),
});

export type JungleCompanionMessage = z.infer<typeof JungleCompanionMessageSchema>;

export interface JungleCompanionClaim {
    /** The user id of the master (the sender id set by the server). */
    owner: number;
    animal: string;
    since: number;
}

/**
 * The list goes in a field of its own: a client of the first version reads `{ animal, since }`, finds neither and
 * ignores the message (the animals of this player then wander on its screen).
 */
export function encodeJungleCompanion(message: JungleCompanionMessage): { name: string; data: unknown } {
    return { name: JUNGLE_COMPANION_EVENT, data: message };
}

/** Returns undefined for any foreign event name or invalid payload, more than JUNGLE_MAX_COMPANIONS included. */
export function decodeJungleCompanion(name: string, data: unknown): JungleCompanionMessage | undefined {
    if (name !== JUNGLE_COMPANION_EVENT) return undefined;
    const parsed = JungleCompanionMessageSchema.safeParse(data);
    if (parsed.success) return parsed.data;
    const single = SingleCompanionMessageSchema.safeParse(data);
    if (!single.success) return undefined;
    const { animal, since } = single.data;
    return { companions: animal === null ? [] : [{ animal, since }] };
}

/**
 * Who each animal follows: the first claim of that animal (smallest `since`), the smaller user id on the same
 * instant; and the first JUNGLE_MAX_COMPANIONS animals of a player at most. The same on every client that got the
 * same claims.
 */
export function jungleCompanionOwners(claims: Iterable<JungleCompanionClaim>): Map<string, JungleCompanionClaim> {
    const sorted = [...claims].sort(
        (a, b) => a.since - b.since || a.owner - b.owner || (a.animal < b.animal ? -1 : a.animal > b.animal ? 1 : 0),
    );
    const owners = new Map<string, JungleCompanionClaim>();
    const counts = new Map<number, number>();
    for (const claim of sorted) {
        const count = counts.get(claim.owner) ?? 0;
        if (owners.has(claim.animal) || count >= JUNGLE_MAX_COMPANIONS) continue;
        owners.set(claim.animal, claim);
        counts.set(claim.owner, count + 1);
    }
    return owners;
}

/** The last list of each other player, on the clock of this page, until it expires. */
export class JungleCompanionClaims {
    private readonly received = new Map<number, { companions: { animal: string; since: number }[]; at: number }>();

    public receive(senderId: number, message: JungleCompanionMessage, nowMs: number): void {
        if (message.companions.length === 0) {
            this.received.delete(senderId);
            return;
        }
        this.received.set(senderId, { companions: message.companions, at: nowMs });
    }

    /** The claims still alive, by user id. */
    public claims(nowMs: number): JungleCompanionClaim[] {
        const claims: JungleCompanionClaim[] = [];
        for (const [owner, entry] of this.received) {
            if (nowMs - entry.at > JUNGLE_COMPANION_EXPIRY_MS) {
                this.received.delete(owner);
                continue;
            }
            for (const { animal, since } of entry.companions) claims.push({ owner, animal, since });
        }
        return claims.sort((a, b) => a.owner - b.owner);
    }
}
