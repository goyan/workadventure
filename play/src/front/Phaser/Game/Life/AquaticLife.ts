/** An animal glides this long from where it is shown to where the server last told it. */
export const GLIDE_MS = 1000;
/** A newborn appears, and a dead animal goes, in this long. */
export const FADE_MS = 300;

/** The kinds the server tells: 0 a male fish, 1 a female fish, 2 a male dolphin, 3 a female dolphin. */
export type AquaticKind = 0 | 1 | 2 | 3;
export const isAquaticKind = (kind: number): kind is AquaticKind =>
    kind === 0 || kind === 1 || kind === 2 || kind === 3;

export interface ShownAnimal {
    id: number;
    /** As the server tells it: twice the number of its species, plus one for a female. */
    kind: number;
    x: number;
    y: number;
    alpha: number;
    facingLeft: boolean;
    /** The user id of the player it follows, for a tamed animal. */
    owner?: number;
}

interface Entry {
    id: number;
    kind: number;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    /** When the glide to (toX, toY) began. */
    since: number;
    /** When it began to appear; undefined for an animal that was there at the first message. */
    appearedAt: number | undefined;
    /** When the server stopped telling it. */
    goneAt: number | undefined;
    facingLeft: boolean;
    owner: number | undefined;
}

const share = (elapsed: number, duration: number): number => Math.min(1, Math.max(0, elapsed / duration));

/**
 * The animals of the water of the relief as this browser shows them. The server tells all of them once a second
 * (AquaticLifeMessage); between two messages each one glides to its last place, a new one fades in and one that is
 * told no more fades out. Nothing here decides anything: the server alone runs the life.
 */
export class AquaticLife {
    private readonly entries = new Map<number, Entry>();
    private started = false;

    /** `accepts` tells the kinds this one shows: those of the water unless told otherwise (the land has its own). */
    constructor(private readonly accepts: (kind: number) => boolean = isAquaticKind) {}

    public receive(
        animals: readonly { id: number; kind: number; x: number; y: number; owner?: number }[],
        now: number,
    ): void {
        const told = new Set<number>();
        for (const animal of animals) {
            if (!this.accepts(animal.kind)) continue;
            told.add(animal.id);
            const entry = this.entries.get(animal.id);
            if (!entry || entry.goneAt !== undefined) {
                this.entries.set(animal.id, {
                    id: animal.id,
                    kind: animal.kind,
                    fromX: animal.x,
                    fromY: animal.y,
                    toX: animal.x,
                    toY: animal.y,
                    since: now,
                    // The animals found on arriving are simply there.
                    appearedAt: this.started ? now : undefined,
                    goneAt: undefined,
                    facingLeft: false,
                    owner: animal.owner,
                });
                continue;
            }
            const at = placeOf(entry, now);
            entry.fromX = at.x;
            entry.fromY = at.y;
            entry.toX = animal.x;
            entry.toY = animal.y;
            entry.since = now;
            entry.owner = animal.owner;
            // It keeps its side while it does not move sideways.
            if (Math.abs(animal.x - at.x) >= 1) entry.facingLeft = animal.x < at.x;
        }
        for (const entry of this.entries.values()) {
            if (told.has(entry.id)) continue;
            if (entry.goneAt === undefined) entry.goneAt = now;
            // Forgotten here too: nothing is drawn while the player hides the life.
            else if (now - entry.goneAt >= FADE_MS) this.entries.delete(entry.id);
        }
        this.started = true;
    }

    /** What to draw now. With reduced motion, each animal is where it was last told, whole, and the dead are gone. */
    public shown(now: number, reducedMotion: boolean): ShownAnimal[] {
        const shown: ShownAnimal[] = [];
        for (const entry of this.entries.values()) {
            if (entry.goneAt !== undefined && (reducedMotion || now - entry.goneAt >= FADE_MS)) {
                this.entries.delete(entry.id);
                continue;
            }
            const place = reducedMotion ? { x: entry.toX, y: entry.toY } : placeOf(entry, now);
            let alpha = 1;
            if (!reducedMotion) {
                if (entry.appearedAt !== undefined) alpha = share(now - entry.appearedAt, FADE_MS);
                if (entry.goneAt !== undefined) alpha *= 1 - share(now - entry.goneAt, FADE_MS);
            }
            shown.push({
                id: entry.id,
                kind: entry.kind,
                ...place,
                alpha,
                facingLeft: entry.facingLeft,
                // A dead animal follows nobody.
                owner: entry.goneAt === undefined ? entry.owner : undefined,
            });
        }
        return shown;
    }

    /** How many fish and dolphins the server last told. */
    public counts(): { fish: number; dolphins: number } {
        let fish = 0;
        let dolphins = 0;
        for (const entry of this.entries.values()) {
            if (entry.goneAt !== undefined) continue;
            if (entry.kind >= 2) dolphins++;
            else fish++;
        }
        return { fish, dolphins };
    }

    public isEmpty(): boolean {
        return this.entries.size === 0;
    }
}

function placeOf(entry: Entry, now: number): { x: number; y: number } {
    const done = share(now - entry.since, GLIDE_MS);
    return {
        x: entry.fromX + (entry.toX - entry.fromX) * done,
        y: entry.fromY + (entry.toY - entry.fromY) * done,
    };
}
