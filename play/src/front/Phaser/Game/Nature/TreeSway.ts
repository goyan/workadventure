import * as Phaser from "phaser";
import { isTreePrefab } from "@workadventure/map-editor";
import { distinguishable } from "../Weather/ScreenScale";
import { BREEZE_KMH } from "./TreeLeafFall";
import { POSE_PAD, treePose } from "./TreePoses";

export { swayAmplitude, treeSwayAngle } from "./TreePoses";

/**
 * Trees of the nature catalogue: the ones that sway in the wind, and whose snow and leaves follow the season. A tree
 * replaced by its snowy image in winter is the same object: it keeps swaying. The list is the server's (the trees
 * that burn): one for both.
 */
export const isSwayingTree = isTreePrefab;

/** A placed tree as the swaying needs it (an `Entity` fits). */
export interface SwayingObject {
    x: number;
    y: number;
    scaleX: number;
    texture: { key: string };
    setTexture(key: string): unknown;
}

export interface TreeSwayOptions {
    /** The trees of the map, with an id for their own time. */
    trees: () => Iterable<{ id: string; object: SwayingObject }>;
    /** Wind speed (km/h) of the map weather, undefined without one (a light breeze then). */
    windSpeed: () => number | undefined;
    /** Where the wind comes from (degrees, 0 north), undefined without a real weather. */
    windFrom: () => number | undefined;
    /**
     * The wind where a tree stands, when it is not the same all over the map (a hurricane: its own at each tree);
     * undefined: the wind of the map.
     */
    windAt?: (x: number, y: number) => { speed: number; from: number } | undefined;
    /** False while the map is edited, or the weather effects are hidden: the trees stand still. */
    enabled: () => boolean;
    /** Key of the texture showing an image in a pose (TreePoseTextures.key), undefined when there is none. */
    poseTexture: (textureKey: string, pose: number) => string | undefined;
    reducedMotion?: boolean;
}

/** The pose of the trees is looked at 15 times a second; the map is only drawn again when one changed. */
const SWAY_FRAME_MS = 1000 / 15;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Trees that sway with the wind. Their trunk stays where it is and their foliage bends: each tree shows one of a few
 * bent images of itself (TreePoses), leaning where the wind goes. Only their picture changes: just before the scene is
 * drawn a bent tree takes its bent image, and right after it gets its own back, so collisions, the map editor and
 * anything reading the tree never see it move.
 */
/** How far the top of a tree moves at most, in map pixels: under one screen pixel it is not moved. */
const SWAY_REACH_PX = 4;

export class TreeSway {
    private readonly reducedMotion: boolean;
    private lastFrameAt = -Infinity;
    private poses = new Map<string, { object: SwayingObject; pose: number }>();
    /** Changes whenever a tree takes another pose: what follows the trees (their shadows) is drawn again then. */
    public version = 0;
    private saved: { object: SwayingObject; x: number; texture: string }[] = [];

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: TreeSwayOptions,
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.lean);
        scene.events.on(Phaser.Scenes.Events.RENDER, this.standUp);
    }

    /** The pose the tree `id` is drawn in: pixels its top stands to the right, 0 straight. */
    public poseOf(id: string): number {
        return this.poses.get(id)?.pose ?? 0;
    }

    /** `now` in ms, `epoch` the server time in ms (the same swing for everyone). */
    public update(now: number, epoch: number): void {
        // Seen from far the sway of a tree is under a pixel: the trees stand still (and their shadows with them).
        if (this.reducedMotion || !this.options.enabled() || !distinguishable(this.scene, SWAY_REACH_PX, 1)) {
            if (this.poses.size > 0) {
                this.poses.clear();
                this.version += 1;
                this.scene.markDirty();
            }
            return;
        }
        if (now - this.lastFrameAt < SWAY_FRAME_MS) return;
        this.lastFrameAt = now;
        const wind = this.options.windSpeed() ?? BREEZE_KMH;
        const windFrom = this.options.windFrom();
        const seconds = epoch / 1000;
        const poses = new Map<string, { object: SwayingObject; pose: number }>();
        let changed = false;
        for (const tree of this.options.trees()) {
            const here = this.options.windAt?.(tree.object.x, tree.object.y);
            const pose = here
                ? treePose(seconds, here.speed, here.from, phaseOf(tree.id))
                : treePose(seconds, wind, windFrom, phaseOf(tree.id));
            if (pose !== this.poseOf(tree.id)) changed = true;
            if (pose !== 0) poses.set(tree.id, { object: tree.object, pose });
        }
        this.poses = poses;
        if (changed) {
            this.version += 1;
            this.scene.markDirty();
        }
    }

    private readonly lean = (): void => {
        this.saved = [];
        for (const { object, pose } of this.poses.values()) {
            const texture = this.options.poseTexture(object.texture.key, pose);
            if (!texture) continue;
            this.saved.push({ object, x: object.x, texture: object.texture.key });
            object.setTexture(texture);
            // The bent image is wider than the tree's own: its trunk stays where the tree stands.
            object.x -= POSE_PAD * object.scaleX;
        }
    };

    private readonly standUp = (): void => {
        for (const { object, x, texture } of this.saved) {
            object.setTexture(texture);
            object.x = x;
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
export function phaseOf(id: string): number {
    let hash = 2166136261;
    for (let index = 0; index < id.length; index++) {
        hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
    }
    return (hash >>> 0) / 4294967296;
}
