import type { TreeFireMessage } from "@workadventure/messages";

/** A charred tree shows one of these many degrees: scorched, burnt, black, black and thinned. */
export const CHAR_DEGREES = 4;
/** What burnt of a tree is told from 0 to this (see TreeFire in libs/map-editor). */
const TOLD_DAMAGE = 16;
const TOLD_FIRE = 255;
/** A tree whose fire went out smoulders this long. */
export const SMOULDER_MS = 30_000;

/** How charred a tree is drawn for what burnt of it as the server tells it (0 to 16): 0 green, 4 black and thinned. */
export function charDegree(damage: number): number {
    if (!Number.isFinite(damage) || damage <= 0) return 0;
    return Math.min(CHAR_DEGREES, Math.ceil((damage / TOLD_DAMAGE) * CHAR_DEGREES));
}

/** An ember on its way as the browser draws it: where it left, where it falls, when it left and how long it flies. */
export interface FlyingEmber {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    leftAt: number;
    flightMs: number;
}

/**
 * The fire of the trees of the map, as the server tells it: for each tree that burns or is charred, its fire (0 to 1)
 * and how charred it is drawn. A tree the server does not name is green. The server alone decides; this only keeps
 * what it said, for the objects that pick their image and the views that draw the flames.
 */
export class TreeFireState {
    private readonly trees = new Map<string, { fire: number; damage: number }>();
    private flying: FlyingEmber[] = [];
    /** When the fire of a tree went out before the eyes of this browser: it smoulders a while. */
    private readonly outAt = new Map<string, number>();

    /** Takes a message of the server. Returns the trees whose image may have to change. */
    public receive(message: TreeFireMessage, now: number): string[] {
        const touched = new Set<string>();
        if (message.whole) {
            for (const id of this.trees.keys()) touched.add(id);
            this.trees.clear();
        }
        if (message.whole) this.outAt.clear();
        for (const tree of message.trees) {
            touched.add(tree.id);
            const burnt = (this.trees.get(tree.id)?.fire ?? 0) > 0;
            if (tree.fire > 0) this.outAt.delete(tree.id);
            else if (burnt && tree.damage > 0) this.outAt.set(tree.id, now);
            if (tree.fire <= 0 && tree.damage <= 0) this.trees.delete(tree.id);
            else this.trees.set(tree.id, { fire: Math.min(1, tree.fire / TOLD_FIRE), damage: tree.damage });
        }
        for (const ember of message.embers) {
            this.flying.push({ ...ember, leftAt: now, flightMs: Math.max(1, ember.flightMs) });
        }
        return [...touched];
    }

    /** The fire of a tree, from 0 (none) to 1 (at its height). */
    public fireOf(id: string): number {
        return this.trees.get(id)?.fire ?? 0;
    }

    /** How charred a tree is drawn, from 0 (green) to CHAR_DEGREES. */
    public degreeOf(id: string): number {
        return charDegree(this.trees.get(id)?.damage ?? 0);
    }

    /** The trees on fire, with their fire. */
    public burning(): { id: string; fire: number }[] {
        const burning: { id: string; fire: number }[] = [];
        for (const [id, tree] of this.trees) if (tree.fire > 0) burning.push({ id, fire: tree.fire });
        return burning;
    }

    public isBurning(): boolean {
        for (const tree of this.trees.values()) if (tree.fire > 0) return true;
        return false;
    }

    /** The embers still in the air at `now`; the ones that landed are forgotten. */
    public embers(now: number): readonly FlyingEmber[] {
        this.flying = this.flying.filter((ember) => now - ember.leftAt < ember.flightMs);
        return this.flying;
    }

    /** Every tree the fire marked: burning or charred. */
    public marked(): string[] {
        return [...this.trees.keys()];
    }

    /**
     * The trees whose fire went out less than SMOULDER_MS ago, with what is left of their smouldering (1 as the fire
     * goes out, 0 at the end): a pale smoke and a few red points on their black crown.
     */
    public smouldering(now: number): { id: string; left: number }[] {
        const trees: { id: string; left: number }[] = [];
        for (const [id, at] of this.outAt) {
            const left = 1 - (now - at) / SMOULDER_MS;
            if (left <= 0 || !this.trees.has(id)) this.outAt.delete(id);
            else trees.push({ id, left: Math.min(1, left) });
        }
        return trees;
    }

    public clear(): string[] {
        const touched = [...this.trees.keys()];
        this.outAt.clear();
        this.trees.clear();
        this.flying = [];
        return touched;
    }
}
