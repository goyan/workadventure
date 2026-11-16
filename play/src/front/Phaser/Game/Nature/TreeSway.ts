import * as Phaser from "phaser";
import { JUNGLE_TREE_PREFIX } from "../Jungle/JunglePlan";

/** Trees of the nature catalogue: the ones that sway in the wind (the same the jungle animals gather around). */
export function isSwayingTree(prefabId: string): boolean {
    return prefabId.startsWith(JUNGLE_TREE_PREFIX);
}

/** Wind (km/h) from which the trees sway as much and as fast as they ever do. */
const STRONGEST_WIND_KMH = 80;
/** How far a tree leans, in degrees: a little in a calm, four degrees at most in a storm. */
const CALM_AMPLITUDE = 0.4;
const STORM_AMPLITUDE = 4;
/** How often a tree sways, in swings a second. */
const CALM_FREQUENCY = 0.25;
const STORM_FREQUENCY = 0.7;

const windShare = (windKmh: number): number =>
    Math.max(0, Math.min(STRONGEST_WIND_KMH, Number.isFinite(windKmh) ? windKmh : 0)) / STRONGEST_WIND_KMH;

/** How far the trees lean at most (degrees) for a wind of `windKmh` km/h. */
export function swayAmplitude(windKmh: number): number {
    return CALM_AMPLITUDE + (STORM_AMPLITUDE - CALM_AMPLITUDE) * windShare(windKmh);
}

/** How many swings a second for a wind of `windKmh` km/h. */
export function swayFrequency(windKmh: number): number {
    return CALM_FREQUENCY + (STORM_FREQUENCY - CALM_FREQUENCY) * windShare(windKmh);
}

/**
 * How far a tree leans (degrees, positive towards the right) `seconds` into the server time: a main swing and a
 * quicker smaller one, so it does not look like a metronome. `phase` (0 to 1) sets each tree in its own time.
 */
export function treeSwayAngle(seconds: number, windKmh: number, phase: number): number {
    const amplitude = swayAmplitude(windKmh);
    const turn = 2 * Math.PI * swayFrequency(windKmh) * seconds;
    return amplitude * (0.7 * Math.sin(turn + 2 * Math.PI * phase) + 0.3 * Math.sin(2.3 * turn + 6 * Math.PI * phase));
}

/**
 * Where the top left corner of a tree image (`x`, `y`, origin at its top left) goes, and its rotation, for the tree
 * to lean by `angle` radians around the middle of its foot, which stays where it is.
 */
export function swayPose(
    x: number,
    y: number,
    width: number,
    height: number,
    angle: number,
): { x: number; y: number; rotation: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: x + width / 2 - (cos * (width / 2) - sin * height),
        y: y + height - (sin * (width / 2) + cos * height),
        rotation: angle,
    };
}

/** A placed object as the swaying needs it. */
export interface SwayingObject {
    x: number;
    y: number;
    rotation: number;
    displayWidth: number;
    displayHeight: number;
}

export interface TreeSwayOptions {
    /** The trees of the map, with an id for their own time. */
    trees: () => Iterable<{ id: string; object: SwayingObject }>;
    /** Wind speed (km/h) of the map weather, undefined without one (a light breeze then). */
    windSpeed: () => number | undefined;
    /** False while the map is edited, or the weather effects are hidden: the trees stand still. */
    enabled: () => boolean;
    reducedMotion?: boolean;
}

/** Wind of the light breeze the trees sway in without a real weather (Automatic or fixed weathers). */
const BREEZE_KMH = 10;
/** The trees move 15 times a second: each move draws the whole map again. */
const SWAY_FRAME_MS = 1000 / 15;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Trees that sway with the wind. Only their picture leans: just before the scene is drawn their image turns around its
 * foot, and right after it is put back, so collisions, the map editor and anything reading their position never see
 * them move.
 */
export class TreeSway {
    private readonly reducedMotion: boolean;
    private lastFrameAt = -Infinity;
    private angles = new Map<SwayingObject, number>();
    private saved: { object: SwayingObject; x: number; y: number; rotation: number }[] = [];

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: TreeSwayOptions,
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.lean);
        scene.events.on(Phaser.Scenes.Events.RENDER, this.standUp);
    }

    /** `now` in ms, `epoch` the server time in ms (the same swing for everyone). */
    public update(now: number, epoch: number): void {
        if (this.reducedMotion || !this.options.enabled()) {
            if (this.angles.size > 0) {
                this.angles.clear();
                this.scene.markDirty();
            }
            return;
        }
        if (now - this.lastFrameAt < SWAY_FRAME_MS) return;
        this.lastFrameAt = now;
        const wind = this.options.windSpeed() ?? BREEZE_KMH;
        const seconds = epoch / 1000;
        const angles = new Map<SwayingObject, number>();
        for (const tree of this.options.trees()) {
            const degrees = treeSwayAngle(seconds, wind, phaseOf(tree.id));
            angles.set(tree.object, (degrees * Math.PI) / 180);
        }
        this.angles = angles;
        if (angles.size > 0) this.scene.markDirty();
    }

    private readonly lean = (): void => {
        this.saved = [];
        for (const [object, angle] of this.angles) {
            this.saved.push({ object, x: object.x, y: object.y, rotation: object.rotation });
            const pose = swayPose(object.x, object.y, object.displayWidth, object.displayHeight, angle);
            object.x = pose.x;
            object.y = pose.y;
            object.rotation = pose.rotation;
        }
    };

    private readonly standUp = (): void => {
        for (const { object, x, y, rotation } of this.saved) {
            object.x = x;
            object.y = y;
            object.rotation = rotation;
        }
        this.saved = [];
    };

    public destroy(): void {
        this.standUp();
        this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.lean);
        this.scene.events.off(Phaser.Scenes.Events.RENDER, this.standUp);
    }
}

/** A tree's own time in its swing, 0 to 1, from its id: the same for everyone. */
function phaseOf(id: string): number {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index++) {
        hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    }
    return (hash >>> 0) / 4294967296;
}
