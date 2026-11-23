import { TILE_PX } from "../types";
import type { BurnableTree } from "./LandTrees";
import { AFTER_FIRE_SECONDS, fireWindPush, GROW_SECONDS } from "./Meadow";

/** A tree burns this long, three times a tile of grass, and its fire rises to its height in this long. */
export const TREE_BURN_SECONDS = 90;
const TREE_RISE_SECONDS = 6;
/** The fire of a tree just lit: it has taken, it does not spread yet. */
const TREE_FIRE_START = 0.01;
/** From this fire a tree heats its neighbours, sets the ground at its foot on fire and throws embers. */
const TREE_FULL_FIRE = 0.5;
/** Two tiles in full fire at the foot of a dry tree light it in this long; on green grass four times as long. */
const GROUND_HEAT_SECONDS = 6;
const GROUND_FULL_FIRE = 2;
const GREEN_HEAT_SHARE = 0.25;
/** A tree in full fire lights a neighbour this near (tiles) in this long without wind. */
const NEIGHBOUR_TILES = 4;
const NEIGHBOUR_HEAT_SECONDS = 10;
/** The wind never holds the heat of a tree back under this share, nor pushes it over that one. */
const NEIGHBOUR_WIND_BOUNDS: readonly [number, number] = [0.1, 3];
/** With nothing burning around it, a tree cools down in this long. */
const COOL_SECONDS = 20;
/** A rain puts a tree out as it puts the grass out, three times less well. */
const TREE_RAIN_QUENCH_MM = 300;
/**
 * A tree that burnt through is green again as fast as the ground after a fire: in the time the meadow of the map takes
 * to grow, AFTER_FIRE_SECONDS at most. It stays black this share of that time, then greens back in the rest.
 */
const BLACK_SHARE = 0.5;
/** Embers: the chance one leaves a tree in full fire at a step of 2 s, how many a tree throws, how many fly at once. */
const EMBER_CHANCE = 0.25;
const EMBER_STEP_SECONDS = 2;
export const TREE_EMBERS_PER_TREE = 8;
export const TREE_EMBERS_PER_ROOM = 40;
/** How far an ember flies downwind (tiles): this far without wind, further with it, never beyond the last. */
const EMBER_BASE_TILES = 4;
const EMBER_TILES_PER_KMH = 0.3;
const EMBER_MAX_TILES = 40;
/** Under this wind (km/h) an ember falls close by, any way; over it, within this angle of the wind (degrees). */
const EMBER_CALM_KMH = 5;
const EMBER_CALM_TILES: readonly [number, number] = [2, 4];
const EMBER_SPREAD_DEGREES = 20;
/** What an ember sets on fire where it falls (tiles around), and what it gives the trees next to it. */
const EMBER_PATCH_TILES = 1;
const EMBER_HEAT = 0.5;
/** The state of a tree is told in this many degrees of fire and of damage. */
const FIRE_DEGREES = 255;
const DAMAGE_DEGREES = 16;

/** How far an ember flies with a wind of `speed` km/h, in tiles. */
export function emberReachTiles(speed: number): number {
    const wind = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    return Math.min(EMBER_MAX_TILES, EMBER_BASE_TILES + EMBER_TILES_PER_KMH * wind);
}

/** What the trees read of the ground they stand on, and do to it: the meadow of the map. */
export interface TreeGround {
    fireAt(tileX: number, tileY: number): number;
    drynessAt(tileX: number, tileY: number): number;
    /** Outdoors on a soil that grows grass: where a tree can burn. */
    growsAt(tileX: number, tileY: number): boolean;
    /** Water lying on the tile or a sodden soil: no fire there. */
    soakedAt(tileX: number, tileY: number): boolean;
    ignite(tileX: number, tileY: number, radius: number): number;
}

export interface TreeFireStepInput {
    seconds: number;
    rainMmPerHour: number;
    /** Where the wind comes from (degrees, 0 north, 90 east) and its speed (km/h). */
    windFrom?: number;
    windSpeed?: number;
    /** The time the meadow of the map takes to grow: a charred tree follows it. */
    growSeconds?: number;
    /** False when no tile of the ground burns: with no tree burning nor damaged either, nothing is looked at. */
    groundBurning?: boolean;
    /** The luck of the embers, from 0 to 1 at each draw. Math.random when absent. */
    random?: () => number;
    /**
     * The wind at a point of the map (pixels): its gusts (km/h) and where it comes from (degrees, 0 north, 90 east);
     * undefined where it is not known. A tree standing in gusts of TREE_FALL_GUST_KMH falls (see the wind laying trees
     * down in step).
     */
    windAt?: (x: number, y: number) => { gust: number; from: number } | undefined;
    /** False when no wind anywhere can lay a tree down: the wind at the trees is not looked at. */
    strongWind?: boolean;
    /**
     * True while a hurricane crosses the room: the trees the wind laid down stay lying, whatever their time, and only
     * once it is over (it ended, or a player stopped it) do they start to wait, then grow back, as the map says. The
     * charred trees are not held.
     */
    stormy?: boolean;
}

/**
 * The gusts that lay a tree down (3 s gusts, km/h): 130, a value for every tree, its species unknown (the trees of the
 * catalogue are images, "Nature:tree-2-10"). It lies between the lowest and the expected gusts that uproot a tree in
 * the Enhanced Fujita scale: 73 to 87 mph (117 to 140 km/h) for a softwood (pine, spruce, fir), 76 to 94 mph (122 to
 * 151 km/h) for a hardwood (oak, maple, birch, ash); trunks snap at 104 and 107 mph (167, 172 km/h) expected (Wind
 * Science and Engineering Center, Texas Tech University, "A Recommendation for an Enhanced Fujita Scale", 2006,
 * appendix A, DI 27 and 28, pp. A-67 to A-69, read). Models of windthrow give critical gusts of 90 to 145 km/h by
 * species and stand (ForestGALES, HWIND: Peltola et al. 1999, Gardiner et al. 2008; summed up by Gemini, to be
 * checked), and Beaufort 10 (89 to 102 km/h of mean wind) "trees uprooted". Reached at the eyewall of a category 1
 * (gusts of 155 km/h), and by a wind of the room of 106 km/h (mean) and more, over the whole map.
 */
export const TREE_FALL_GUST_KMH = 130;
/**
 * How long a tree stands in those gusts before it falls: two steps of the meadow. A gust is a 3 s peak, and the storm is
 * reduced to the map (its eyewall passes over a tree in seconds, faster still when the hurricane is sped up): one step
 * of strong wind alone does not lay a tree down, two do.
 */
export const TREE_FALL_SECONDS = 4;

/** An ember on its way, in map pixels: where it left, where it falls, how long it flies. */
export interface Ember {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    flightSeconds: number;
}

/** The state of a tree as it is told: its fire from 0 to 255, what burnt of it from 0 to 16. */
export interface ToldTree {
    id: string;
    fire: number;
    damage: number;
    /** Laid down by the wind: where that wind came from, in degrees, plus 1 (absent: standing). */
    fallen?: number;
}

/** The state of a tree as it is kept across a restart: what burnt of it, and how long it still stays black. */
export interface KeptTree {
    id: string;
    damage: number;
    wait: number;
    /** Laid down by the wind coming from there (degrees): it lies, then grows back, as long as a charred tree. */
    fallenFrom?: number;
}

interface Tree extends BurnableTree {
    tileX: number;
    tileY: number;
    /** How hot it is, from 0 to 1: at 1 it takes fire. */
    heat: number;
    /** Its fire, from 0 (none) to 1 (at its height). */
    fire: number;
    /** What burnt of it, from 0 (green) to 1 (charred). */
    damage: number;
    /** Seconds it still stays black (or lies) before greening (or growing) back. */
    wait: number;
    /** Laid down by the wind: where that wind came from (degrees, 0 north, 90 east). Its damage is how much is still to grow back. */
    fallenFrom?: number;
    /** Seconds it stood in gusts strong enough to lay it down, one after the other. */
    strain: number;
    embers: number;
    /** What it gained of heat at this step: it only cools when it gained nothing. */
    gained: number;
    told: string;
}

const HEALTHY = "0:0:0";

/**
 * The fire of the trees of a map, kept by the server beside the meadow and stepped with it. A tree heats up from
 * the grass burning at its foot, from a tree in full fire nearby (the wind carries the heat) and from the embers
 * falling next to it; hot enough, it takes. It burns three times as long as grass, sets the ground at its foot on
 * fire again, and throws embers downwind that start new fires far ahead. Water at its foot and a hard rain put it
 * out. What burnt of it stays black for a while, then it greens back by itself. A tree that is neither burning nor
 * damaged holds no state, and nothing is computed while nothing burns.
 */
export class TreeFire {
    private trees = new Map<string, Tree>();
    /** The trees by the tile of their foot: the neighbours of a tree on fire, the trees an ember falls next to. */
    private byTile = new Map<string, Tree[]>();
    /** The embers that left at the last step: they land at this one. */
    private flying: Ember[] = [];

    constructor(
        trees: readonly BurnableTree[],
        private readonly ground: TreeGround,
    ) {
        this.setTrees(trees);
    }

    /** The trees of the map as it is now: a tree keeps its state by its id, wherever it stands. */
    public setTrees(trees: readonly BurnableTree[]): void {
        const previous = this.trees;
        this.trees = new Map();
        this.byTile = new Map();
        for (const tree of trees) {
            const before = previous.get(tree.id);
            const tileX = Math.floor(tree.x / TILE_PX);
            const tileY = Math.floor(tree.y / TILE_PX);
            const kept: Tree = {
                heat: 0,
                fire: 0,
                damage: 0,
                wait: 0,
                strain: 0,
                embers: 0,
                gained: 0,
                told: HEALTHY,
                ...before,
                id: tree.id,
                x: tree.x,
                y: tree.y,
                tileX,
                tileY,
            };
            this.trees.set(tree.id, kept);
            const key = `${tileX},${tileY}`;
            const there = this.byTile.get(key);
            if (there) there.push(kept);
            else this.byTile.set(key, [kept]);
        }
    }

    public stateOf(id: string): { heat: number; fire: number; damage: number; wait: number; fallenFrom?: number } {
        const tree = this.trees.get(id);
        return tree
            ? { heat: tree.heat, fire: tree.fire, damage: tree.damage, wait: tree.wait, fallenFrom: tree.fallenFrom }
            : { heat: 0, fire: 0, damage: 0, wait: 0 };
    }

    /** How many trees are on fire. */
    public burning(): number {
        let count = 0;
        for (const tree of this.trees.values()) if (tree.fire > 0) count++;
        return count;
    }

    /** Whether any tree burns, is damaged, is hot, or any ember flies: whether a step has anything to do. */
    public active(): boolean {
        if (this.flying.length > 0) return true;
        for (const tree of this.trees.values()) if (tree.fire > 0 || tree.damage > 0 || tree.heat > 0) return true;
        return false;
    }

    /** Where the trees stand (map pixels): the forests the air of a hurricane drags on. */
    public places(): { x: number; y: number }[] {
        return [...this.trees.values()].map((tree) => ({ x: tree.x, y: tree.y }));
    }

    /** The trees on fire, with their fire from 0 to 1 (map pixels): what the animals run from. */
    public fires(): { x: number; y: number; fire: number }[] {
        const fires: { x: number; y: number; fire: number }[] = [];
        for (const tree of this.trees.values())
            if (tree.fire > 0) fires.push({ x: tree.x, y: tree.y, fire: tree.fire });
        return fires;
    }

    private canTake(tree: Tree): boolean {
        return (
            tree.fire === 0 &&
            tree.damage === 0 &&
            this.ground.growsAt(tree.tileX, tree.tileY) &&
            !this.ground.soakedAt(tree.tileX, tree.tileY)
        );
    }

    private light(tree: Tree): void {
        tree.fire = TREE_FIRE_START;
        tree.heat = 0;
    }

    /**
     * The patch of fire of a player (map pixels): the trees whose foot is in it take at once, unless their foot is
     * wet, they stand where nothing burns, or they are still black. Returns how many took.
     */
    public ignite(x: number, y: number, radius: number): number {
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) return 0;
        let lit = 0;
        for (const tree of this.treesNear(x, y, Math.max(0, radius))) {
            if (!this.canTake(tree)) continue;
            this.light(tree);
            lit++;
        }
        return lit;
    }

    /** The trees whose foot is within `reach` map pixels of a point. */
    private treesNear(x: number, y: number, reach: number): Tree[] {
        const found: Tree[] = [];
        const fromX = Math.floor((x - reach) / TILE_PX);
        const toX = Math.floor((x + reach) / TILE_PX);
        const fromY = Math.floor((y - reach) / TILE_PX);
        const toY = Math.floor((y + reach) / TILE_PX);
        for (let tileY = fromY; tileY <= toY; tileY++) {
            for (let tileX = fromX; tileX <= toX; tileX++) {
                for (const tree of this.byTile.get(`${tileX},${tileY}`) ?? []) {
                    if ((tree.x - x) ** 2 + (tree.y - y) ** 2 <= reach * reach + 1e-6) found.push(tree);
                }
            }
        }
        return found;
    }

    /**
     * One step. Returns the trees whose told state changed, and the embers that left: they land at the next step.
     */
    public step(input: TreeFireStepInput): { changed: ToldTree[]; embers: Ember[] } {
        const seconds = Number.isFinite(input.seconds) && input.seconds > 0 ? input.seconds : 0;
        const windAt = input.strongWind === false ? undefined : input.windAt;
        if (seconds === 0 || (input.groundBurning === false && !this.active() && !windAt)) {
            return { changed: [], embers: [] };
        }
        const rain = Number.isFinite(input.rainMmPerHour) && input.rainMmPerHour > 0 ? input.rainMmPerHour : 0;
        const grow =
            input.growSeconds !== undefined && Number.isFinite(input.growSeconds) && input.growSeconds > 0
                ? input.growSeconds
                : GROW_SECONDS;
        const afterFire = Math.min(grow, AFTER_FIRE_SECONDS);
        const random = input.random ?? Math.random;
        const speed =
            input.windSpeed !== undefined && Number.isFinite(input.windSpeed) ? Math.max(0, input.windSpeed) : 0;
        // Where the wind goes: a wind from the north blows south, down the map.
        const from =
            ((input.windFrom !== undefined && Number.isFinite(input.windFrom) ? input.windFrom : 0) * Math.PI) / 180;
        const windX = -Math.sin(from);
        const windY = Math.cos(from);
        const { ground } = this;
        for (const tree of this.trees.values()) tree.gained = 0;

        // The wind lays down the trees standing in its strongest gusts, the way it blows: each lies as long as a
        // charred tree stays black, then grows back in the time a charred tree greens back (the same clock), counted
        // from the end of the hurricane that laid it down (stormy).
        if (windAt) {
            for (const tree of this.trees.values()) {
                if (tree.fire > 0 || tree.damage > 0) {
                    tree.strain = 0;
                    continue;
                }
                const wind = windAt(tree.x, tree.y);
                if (!wind || !Number.isFinite(wind.gust) || wind.gust < TREE_FALL_GUST_KMH) {
                    tree.strain = 0;
                    continue;
                }
                tree.strain += seconds;
                if (tree.strain < TREE_FALL_SECONDS - 1e-9) continue;
                tree.strain = 0;
                tree.heat = 0;
                tree.damage = 1;
                tree.wait = BLACK_SHARE * afterFire;
                tree.fallenFrom = ((Math.round(Number.isFinite(wind.from) ? wind.from : 0) % 360) + 360) % 360;
            }
        }

        // The embers of the last step land: a small fire on the ground, and heat for the trees next to it.
        for (const ember of this.flying) {
            const tileX = Math.floor(ember.toX / TILE_PX);
            const tileY = Math.floor(ember.toY / TILE_PX);
            ground.ignite(tileX, tileY, EMBER_PATCH_TILES);
            for (let y = tileY - 1; y <= tileY + 1; y++) {
                for (let x = tileX - 1; x <= tileX + 1; x++) {
                    for (const tree of this.byTile.get(`${x},${y}`) ?? []) tree.gained += EMBER_HEAT;
                }
            }
        }
        this.flying = [];

        // The trees on fire burn, go out under water and rain, heat their neighbours and throw embers.
        const embers: Ember[] = [];
        // What burnt at this step is done for this step: a tree just put out starts waiting at the next.
        const burnt = new Set<Tree>();
        for (const tree of this.trees.values()) {
            if (tree.fire === 0) continue;
            burnt.add(tree);
            let fire = tree.fire + seconds / TREE_RISE_SECONDS - (seconds * rain) / TREE_RAIN_QUENCH_MM;
            if (ground.soakedAt(tree.tileX, tree.tileY)) fire = 0;
            if (fire <= 0) {
                // Put out: what burnt of it stays black, the less the shorter.
                tree.fire = 0;
                tree.wait = BLACK_SHARE * afterFire * tree.damage;
                continue;
            }
            tree.damage += seconds / TREE_BURN_SECONDS;
            if (tree.damage >= 1 - 1e-9) {
                tree.damage = 1;
                tree.fire = 0;
                tree.wait = BLACK_SHARE * afterFire;
                continue;
            }
            tree.fire = Math.min(1, fire);
            if (tree.fire < TREE_FULL_FIRE) continue;
            ground.ignite(tree.tileX, tree.tileY, 1);
            for (const other of this.treesNear(tree.x, tree.y, NEIGHBOUR_TILES * TILE_PX)) {
                if (other === tree || other.fire > 0 || other.damage > 0) continue;
                const far = Math.hypot(other.x - tree.x, other.y - tree.y);
                const along = far === 0 ? 0 : ((other.x - tree.x) * windX + (other.y - tree.y) * windY) / far;
                const push = Math.min(
                    NEIGHBOUR_WIND_BOUNDS[1],
                    Math.max(NEIGHBOUR_WIND_BOUNDS[0], fireWindPush(along, speed)),
                );
                other.gained += (seconds / NEIGHBOUR_HEAT_SECONDS) * push;
            }
            if (
                tree.embers < TREE_EMBERS_PER_TREE &&
                embers.length < TREE_EMBERS_PER_ROOM &&
                random() < (EMBER_CHANCE * seconds) / EMBER_STEP_SECONDS
            ) {
                tree.embers++;
                embers.push(this.ember(tree, speed, windX, windY, seconds, random));
            }
        }

        // The other trees: the green ones heat up or cool down, the black ones wait, then green back.
        for (const tree of this.trees.values()) {
            if (burnt.has(tree)) continue;
            if (tree.damage > 0) {
                tree.heat = 0;
                // Laid down by the wind: nothing grows back before the hurricane is over.
                if (input.stormy === true && tree.fallenFrom !== undefined) continue;
                if (tree.wait > 0) {
                    tree.wait = Math.max(0, tree.wait - seconds);
                } else {
                    tree.damage = Math.max(0, tree.damage - seconds / (afterFire * (1 - BLACK_SHARE)));
                    if (tree.damage <= 1e-9) {
                        tree.damage = 0;
                        tree.embers = 0;
                        tree.fallenFrom = undefined;
                    }
                }
                continue;
            }
            if (!this.canTake(tree)) {
                tree.heat = 0;
                continue;
            }
            let below = 0;
            for (let y = tree.tileY - 1; y <= tree.tileY + 1; y++) {
                for (let x = tree.tileX - 1; x <= tree.tileX + 1; x++) below += ground.fireAt(x, y);
            }
            if (below > 0) {
                const dry = GREEN_HEAT_SHARE + (1 - GREEN_HEAT_SHARE) * ground.drynessAt(tree.tileX, tree.tileY);
                tree.gained += (seconds / GROUND_HEAT_SECONDS) * Math.min(1, below / GROUND_FULL_FIRE) * dry;
            }
            if (tree.gained > 0) tree.heat += tree.gained;
            else tree.heat = Math.max(0, tree.heat - seconds / COOL_SECONDS);
            if (tree.heat >= 1 - 1e-9) this.light(tree);
        }

        this.flying = embers;
        return { changed: this.changes(), embers };
    }

    private ember(
        tree: Tree,
        speed: number,
        windX: number,
        windY: number,
        seconds: number,
        random: () => number,
    ): Ember {
        const far = random();
        const turn = random();
        let tiles: number;
        let angle: number;
        if (speed < EMBER_CALM_KMH) {
            tiles = EMBER_CALM_TILES[0] + (EMBER_CALM_TILES[1] - EMBER_CALM_TILES[0]) * far;
            angle = turn * 2 * Math.PI;
        } else {
            // Between half its reach and its whole reach, within a few degrees of the wind.
            tiles = emberReachTiles(speed) * (0.5 + 0.5 * far);
            angle = Math.atan2(windY, windX) + ((turn - 0.5) * 2 * EMBER_SPREAD_DEGREES * Math.PI) / 180;
        }
        return {
            fromX: tree.x,
            fromY: tree.y,
            toX: tree.x + Math.cos(angle) * tiles * TILE_PX,
            toY: tree.y + Math.sin(angle) * tiles * TILE_PX,
            flightSeconds: seconds,
        };
    }

    private static told(tree: Tree): ToldTree {
        const told: ToldTree = {
            id: tree.id,
            fire: tree.fire > 0 ? Math.max(1, Math.round(tree.fire * FIRE_DEGREES)) : 0,
            damage: tree.damage > 0 ? Math.max(1, Math.round(tree.damage * DAMAGE_DEGREES)) : 0,
        };
        if (tree.fallenFrom !== undefined) told.fallen = tree.fallenFrom + 1;
        return told;
    }

    /** The trees whose told state is not the one told last. */
    private changes(): ToldTree[] {
        const changed: ToldTree[] = [];
        for (const tree of this.trees.values()) {
            const told = TreeFire.told(tree);
            const key = `${told.fire}:${told.damage}:${told.fallen ?? 0}`;
            if (key === tree.told) continue;
            tree.told = key;
            changed.push(told);
        }
        return changed;
    }

    /** Every tree that burns or is damaged, as it is told: for who enters the room. */
    public damaged(): ToldTree[] {
        const damaged: ToldTree[] = [];
        for (const tree of this.trees.values()) {
            if (tree.fire > 0 || tree.damage > 0) damaged.push(TreeFire.told(tree));
        }
        return damaged;
    }

    /** What is kept across a restart: the damage, not the fire. A tree that burnt stands charred, as far as it burnt. */
    public write(): KeptTree[] {
        const kept: KeptTree[] = [];
        for (const tree of this.trees.values()) {
            if (tree.damage <= 0) continue;
            const wait = tree.fire > 0 ? BLACK_SHARE * AFTER_FIRE_SECONDS * tree.damage : tree.wait;
            kept.push({
                id: tree.id,
                damage: tree.damage,
                wait,
                ...(tree.fallenFrom === undefined ? {} : { fallenFrom: tree.fallenFrom }),
            });
        }
        return kept;
    }

    /** Takes back a kept state, read from a store: only what names a tree of the map, with numbers that make sense. */
    public read(kept: unknown): void {
        if (!Array.isArray(kept)) return;
        for (const each of kept as unknown[]) {
            if (typeof each !== "object" || each === null) continue;
            const { id, damage, wait, fallenFrom } = each as Partial<Record<keyof KeptTree, unknown>>;
            const tree = typeof id === "string" ? this.trees.get(id) : undefined;
            if (!tree || typeof damage !== "number" || typeof wait !== "number") continue;
            if (!Number.isFinite(damage) || !Number.isFinite(wait) || damage <= 0) continue;
            tree.fire = 0;
            tree.heat = 0;
            tree.damage = Math.min(1, damage);
            tree.wait = Math.max(0, wait);
            tree.fallenFrom =
                typeof fallenFrom === "number" && Number.isFinite(fallenFrom)
                    ? ((Math.round(fallenFrom) % 360) + 360) % 360
                    : undefined;
        }
    }

    /** Every tree green again (the meadow of the map is turned off). Returns the trees to tell green. */
    public clear(): ToldTree[] {
        const cleared: ToldTree[] = [];
        for (const tree of this.trees.values()) {
            if (tree.fire > 0 || tree.damage > 0) cleared.push({ id: tree.id, fire: 0, damage: 0 });
            tree.fire = 0;
            tree.damage = 0;
            tree.heat = 0;
            tree.wait = 0;
            tree.strain = 0;
            tree.fallenFrom = undefined;
            tree.embers = 0;
            tree.told = HEALTHY;
        }
        this.flying = [];
        return cleared;
    }
}
