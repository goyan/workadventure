import { TERRAIN_CELL, waterObjectsOf } from "@workadventure/map-editor";
import type { WAMFileFormat, WaterObject } from "@workadventure/map-editor";
import { FLOOR_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import { distinguishable } from "../Weather/ScreenScale";
import { isEffectShown } from "../../../Stores/EffectsStore";
import type { CurrentWater } from "./WaterCurrent";
import { waterCurrentAt } from "./WaterCurrent";
import type { FoamView } from "./WaterFoam";
import {
    FOAM_MIN_DEPTH_PX,
    foamStreak,
    sourceRings,
    WaterFoam,
    wetAround,
    whirlDots,
    whirlTurnsPerSecond,
} from "./WaterFoam";

import { pixelBlocksShownNow } from "./PixelBlocksShown";
import { strokeRing, strokeStreak } from "./WaterFlowStrokes";

export interface WaterFlowViewOptions {
    /** The water of the relief as this browser shows it. */
    water: CurrentWater & { hasAnything(): boolean };
    /** The map, for its sources and its sinks. */
    wam: () => Pick<WAMFileFormat, "entities"> | undefined;
    /** What the camera shows, in map pixels. */
    view: () => FoamView;
    reducedMotion?: boolean;
    /** Whether the water is frozen there for this player (Frost.ts): no foam runs on it, no whirl turns in it. */
    isFrozenAt?: (x: number, y: number) => boolean;
}

/** Over the water of the relief (0.65), under the puddles (0.7), the objects and the avatars. */
export const FOAM_DEPTH = 0.66;
/** The whirls and the rings: over the floors and the floor objects (a sink may be one), under every character. */
const MARKS_DEPTH = FLOOR_OBJECT_DEPTH + 0.44;
/** The moving water is drawn 15 times a second, as the leaves of the trees: each drawing draws the map again. */
const FRAME_MS = 1000 / 15;
/** The sources and the sinks of the map are read again this often: reading them goes through every object. */
const OBJECTS_MS = 2000;
const WHIRL_COLOR = 0xe8f6ff;
/** A whirl is this wide, in a share of the disc of its sink, within these bounds (map pixels). */
const WHIRL_DISC_SHARE = 0.6;
const WHIRL_SMALLEST = 12;
const WHIRL_LARGEST = 96;
/** A whirl shows when the water around the disc of its sink is this deep, and is whole from twice that on. */
const WHIRL_MIN_DEPTH_PX = 2;
/** The rings of a source reach this far from its foot, in map pixels, and further for one that pours over a disc. */
const RINGS_RADIUS = 10;
const RINGS_LARGEST = 40;
/** A source or a sink a little outside the screen is still drawn. */
const VIEW_MARGIN = 112;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Shows the water of the relief moving: foam carried by its current (which way and how hard it runs), a whirl over
 * each sink that has water to take, rings over each source. Read from what this browser already knows (the water
 * the server sends, the objects of the map): nothing is asked of the server. Nothing moves for someone who asked
 * for less motion.
 */
/** About how long a streak of foam is, in map pixels: under two screen pixels it is not drawn. */
const FOAM_STREAK_PX = 8;
/**
 * The foam the current carries shows on shallow water (a stream, a river, a sheet running on land): under this
 * depth, in pixels (a tile deep). Deeper, moving water is a swell, which carries no foam unless it runs very hard:
 * the foam of the waves that break and the whitecaps of the wind are drawn by the water shader (GroundSplat).
 */
const STREAM_FOAM_DEPTH_PX = 32;
const DEEP_FOAM_CURRENT = 0.9;

export class WaterFlowView {
    private readonly reducedMotion: boolean;
    private readonly foamGraphics: Phaser.GameObjects.Graphics;
    private readonly marksGraphics: Phaser.GameObjects.Graphics;
    private readonly foam: WaterFoam;
    private objects: WaterObject[] = [];
    private objectsReadAt = -Infinity;
    private lastFrameAt = -Infinity;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: WaterFlowViewOptions,
    ) {
        this.reducedMotion = options.reducedMotion ?? REDUCED_MOTION;
        this.foamGraphics = scene.add.graphics().setDepth(FOAM_DEPTH);
        this.marksGraphics = scene.add.graphics().setDepth(MARKS_DEPTH);
        this.foam = new WaterFoam((x, y, now) => {
            if (options.isFrozenAt?.(x, y)) return { x: 0, y: 0 };
            const current = waterCurrentAt(options.water, x, y, now, FOAM_MIN_DEPTH_PX);
            if (
                options.water.depthAt(x, y, now) >= STREAM_FOAM_DEPTH_PX &&
                Math.hypot(current.x, current.y) < DEEP_FOAM_CURRENT
            ) {
                return { x: 0, y: 0 };
            }
            return current;
        });
    }

    /** `now` in ms of the game. */
    public update(now: number): void {
        // Seen from far a streak of foam is under a pixel: neither moved nor drawn.
        if (
            this.reducedMotion ||
            !isEffectShown("waterFlow") ||
            !this.options.water.hasAnything() ||
            !distinguishable(this.scene, FOAM_STREAK_PX)
        ) {
            this.clear();
            return;
        }
        const elapsed = now - this.lastFrameAt;
        if (elapsed < FRAME_MS) return;
        this.lastFrameAt = now;
        if (now - this.objectsReadAt >= OBJECTS_MS) {
            this.objects = waterObjectsOf(this.options.wam());
            this.objectsReadAt = now;
        }
        const view = this.options.view();
        this.foam.step(now, elapsed, view);
        this.foamGraphics.clear();
        this.marksGraphics.clear();
        let drawn = false;
        // Smooth lines over the ground drawn flat; whole pixels over the relief in pixel art.
        const pixelArt = pixelBlocksShownNow();
        for (const fleck of this.foam.flecks()) {
            const streak = foamStreak(fleck);
            if (streak.alpha <= 0) continue;
            strokeStreak(this.foamGraphics, streak, pixelArt);
            drawn = true;
        }
        const seconds = now / 1000;
        for (const object of this.objects) {
            const x = (object.cellX + 0.5) * TERRAIN_CELL;
            const y = (object.cellY + 0.5) * TERRAIN_CELL;
            if (
                x < view.x - VIEW_MARGIN ||
                y < view.y - VIEW_MARGIN ||
                x > view.x + view.width + VIEW_MARGIN ||
                y > view.y + view.height + VIEW_MARGIN
            )
                continue;
            // Under the ice a source or a sink still runs, unseen.
            if (this.options.isFrozenAt?.(x, y)) continue;
            const disc = object.radiusCells * TERRAIN_CELL;
            if (object.litresPerMinute < 0) {
                // A sink keeps its own disc dry: the water it takes shows just beyond it.
                const around = wetAround(this.options.water, x, y, disc + 2 * TERRAIN_CELL, now);
                if (around < WHIRL_MIN_DEPTH_PX) continue;
                const strength = Math.min(1, around / (2 * WHIRL_MIN_DEPTH_PX));
                const radius = Math.max(WHIRL_SMALLEST, Math.min(WHIRL_LARGEST, disc * WHIRL_DISC_SHARE));
                for (const dot of whirlDots(seconds, whirlTurnsPerSecond(-object.litresPerMinute), radius)) {
                    this.marksGraphics.fillStyle(WHIRL_COLOR, dot.alpha * strength);
                    this.marksGraphics.fillRect(Math.round(x + dot.x), Math.round(y + dot.y), dot.size, dot.size);
                }
            } else {
                const radius = Math.min(RINGS_LARGEST, RINGS_RADIUS + disc / 2);
                for (const ring of sourceRings(seconds, radius)) {
                    strokeRing(this.marksGraphics, x, y, ring, pixelArt);
                }
            }
            drawn = true;
        }
        if (drawn || this.drawn) this.scene.markDirty();
        this.drawn = drawn;
    }

    private clear(): void {
        this.foam.clear();
        if (!this.drawn) return;
        this.foamGraphics.clear();
        this.marksGraphics.clear();
        this.drawn = false;
        this.lastFrameAt = -Infinity;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.foamGraphics.destroy();
        this.marksGraphics.destroy();
    }
}
