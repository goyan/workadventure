import { TERRAIN_CELL, waterObjectsOf } from "@workadventure/map-editor";
import type { WAMFileFormat, WaterObject } from "@workadventure/map-editor";
import { FLOOR_OBJECT_DEPTH } from "../../ECS/EntityLayerDepth";
import { distinguishable } from "../Weather/ScreenScale";
import { isEffectShown } from "../../../Stores/EffectsStore";
import { BreakingFoam } from "./BreakingFoam";
import { whitecapAlpha, WHITECAP_MIN_DEPTH_PX, Whitecaps, windHeading } from "./Whitecaps";
import type { SettledWater } from "./TerrainWater";
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

export interface WaterFlowViewOptions {
    /** The water of the relief as this browser shows it. */
    water: CurrentWater & {
        hasAnything(): boolean;
        /** The last state of the water and a number that changes with it: the foam of its waves is read from them. */
        settled?(): SettledWater;
        version?(): number;
    };
    /** The map, for its sources and its sinks. */
    wam: () => Pick<WAMFileFormat, "entities"> | undefined;
    /** What the camera shows, in map pixels. */
    view: () => FoamView;
    /** The wind of the map: how fast it blows (km/h) and where it comes from (degrees). It raises the whitecaps. */
    wind?: () => { speed?: number; from?: number } | undefined;
    /** Whether a point of the map (map pixels) is outdoors: the wind raises no whitecaps in a building. */
    isOutdoorAt?: (x: number, y: number) => boolean;
    reducedMotion?: boolean;
    /** Whether the water is frozen there for this player (Frost.ts): no foam runs on it, no whirl turns in it. */
    isFrozenAt?: (x: number, y: number) => boolean;
}

/** Over the water of the relief (0.65), under the puddles (0.7), the objects and the avatars. */
const FOAM_DEPTH = 0.66;
/** The whirls and the rings: over the floors and the floor objects (a sink may be one), under every character. */
const MARKS_DEPTH = FLOOR_OBJECT_DEPTH + 0.44;
/** The moving water is drawn 15 times a second, as the leaves of the trees: each drawing draws the map again. */
const FRAME_MS = 1000 / 15;
/** The sources and the sinks of the map are read again this often: reading them goes through every object. */
const OBJECTS_MS = 2000;
const FOAM_COLOR = 0xffffff;
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
 * depth, in pixels (a tile deep). Deeper, moving water is a swell, which carries no foam unless it runs very hard.
 */
const STREAM_FOAM_DEPTH_PX = 32;
const DEEP_FOAM_CURRENT = 0.9;
/** The foam of the waves is drawn cell by cell, never more cells than this: seen from far, one for several. */
const MOST_FOAM_CELLS = 2500;
/** A cell of foam shows from this many screen pixels on. */
const FOAM_CELL_SCREEN_PX = 5;

export class WaterFlowView {
    private readonly reducedMotion: boolean;
    private readonly foamGraphics: Phaser.GameObjects.Graphics;
    private readonly marksGraphics: Phaser.GameObjects.Graphics;
    private readonly foam: WaterFoam;
    /** The foam of the waves that break and of the floods that advance. */
    private readonly breaking = new BreakingFoam();
    private breakingVersion = -1;
    /** The whitecaps the wind raises on open water. */
    private readonly whitecaps: Whitecaps;
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
        this.whitecaps = new Whitecaps(
            (x, y, now) =>
                options.water.depthAt(x, y, now) >= WHITECAP_MIN_DEPTH_PX &&
                options.isFrozenAt?.(x, y) !== true &&
                options.isOutdoorAt?.(x, y) !== false,
        );
        this.foam = new WaterFoam((x, y, now) => {
            if (options.isFrozenAt?.(x, y)) return { x: 0, y: 0 };
            const current = waterCurrentAt(options.water, x, y, now, FOAM_MIN_DEPTH_PX);
            // Over deep water the current of a swell carries no foam: only a water that runs very hard does.
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
        if (this.reducedMotion || !isEffectShown("waterFlow") || !this.options.water.hasAnything()) {
            this.clear();
            return;
        }
        // Seen from far a streak of foam is under a pixel: neither moved nor drawn. The foam of the waves, drawn by
        // blocks, still shows.
        const streaks = distinguishable(this.scene, FOAM_STREAK_PX);
        const elapsed = now - this.lastFrameAt;
        if (elapsed < FRAME_MS) return;
        this.lastFrameAt = now;
        if (now - this.objectsReadAt >= OBJECTS_MS) {
            this.objects = waterObjectsOf(this.options.wam());
            this.objectsReadAt = now;
        }
        const view = this.options.view();
        if (streaks) this.foam.step(now, elapsed, view);
        else this.foam.clear();
        this.foamGraphics.clear();
        this.marksGraphics.clear();
        let drawn = this.drawBreakingFoam(now, view);
        // The whitecaps of the wind: a short white crest across it. Seen from far they are under a pixel.
        const wind = streaks ? this.options.wind?.() : undefined;
        if (wind) this.whitecaps.step(now, elapsed, view, wind.speed, wind.from);
        else this.whitecaps.clear();
        const heading = windHeading(wind?.from);
        for (const cap of this.whitecaps.caps()) {
            const alpha = whitecapAlpha(cap);
            if (alpha <= 0) continue;
            // Across the wind: a quarter turn from where it blows. Level when the wind has no known direction.
            const acrossX = heading ? -heading.y : 1;
            const acrossY = heading ? heading.x : 0;
            this.foamGraphics.lineStyle(1.5, FOAM_COLOR, 0.75 * alpha);
            this.foamGraphics.lineBetween(
                cap.x - acrossX * cap.half,
                cap.y - acrossY * cap.half,
                cap.x + acrossX * cap.half,
                cap.y + acrossY * cap.half,
            );
            drawn = true;
        }
        for (const fleck of this.foam.flecks()) {
            const streak = foamStreak(fleck);
            if (streak.alpha <= 0) continue;
            this.foamGraphics.lineStyle(1.5, FOAM_COLOR, streak.alpha);
            this.foamGraphics.lineBetween(streak.fromX, streak.fromY, streak.toX, streak.toY);
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
                    this.marksGraphics.lineStyle(1.5, WHIRL_COLOR, ring.alpha);
                    this.marksGraphics.strokeCircle(x, y, ring.radius);
                }
            }
            drawn = true;
        }
        if (drawn || this.drawn) this.scene.markDirty();
        this.drawn = drawn;
    }

    /**
     * The foam of the waves: white flecks on the cells where a wave breaks or a flood advances, fading behind it.
     * Returns whether any was drawn.
     */
    private drawBreakingFoam(now: number, view: FoamView): boolean {
        const water = this.options.water;
        const settled = water.settled?.();
        if (!settled) return false;
        const version = water.version?.() ?? 0;
        if (version !== this.breakingVersion) {
            this.breakingVersion = version;
            this.breaking.absorb(settled, water.relief(), now);
        }
        if (!this.breaking.active(now)) return false;
        const zoom = this.scene.cameras.main.zoom > 0 ? this.scene.cameras.main.zoom : 1;
        // One fleck for a block of cells when they are too small on the screen, or too many.
        let size = Math.max(1, Math.ceil(FOAM_CELL_SCREEN_PX / (TERRAIN_CELL * zoom)));
        const cellsAt = (side: number): number =>
            Math.ceil(view.width / (side * TERRAIN_CELL)) * Math.ceil(view.height / (side * TERRAIN_CELL));
        while (cellsAt(size) > MOST_FOAM_CELLS * 4) size++;
        const firstX = Math.floor(view.x / (size * TERRAIN_CELL)) * size;
        const firstY = Math.floor(view.y / (size * TERRAIN_CELL)) * size;
        const lastX = Math.ceil((view.x + view.width) / TERRAIN_CELL);
        const lastY = Math.ceil((view.y + view.height) / TERRAIN_CELL);
        const block = size * TERRAIN_CELL;
        // The flecks of a cell change four times a second: foam seethes.
        const beat = Math.floor(now / 250);
        let cells = 0;
        for (let cellY = firstY; cellY < lastY && cells < MOST_FOAM_CELLS; cellY += size) {
            for (let cellX = firstX; cellX < lastX && cells < MOST_FOAM_CELLS; cellX += size) {
                const strength = this.breaking.foamAt(cellX, cellY, now);
                if (
                    strength <= 0 ||
                    this.options.isFrozenAt?.((cellX + 0.5) * TERRAIN_CELL, (cellY + 0.5) * TERRAIN_CELL)
                ) {
                    continue;
                }
                cells++;
                // Two flecks in the cell, where a number drawn from its place and the beat puts them.
                let mixed = (cellX * 73856093) ^ (cellY * 19349663) ^ (beat * 83492791);
                for (let fleck = 0; fleck < 2; fleck++) {
                    mixed = (Math.imul(mixed ^ (mixed >>> 15), 2246822519) ^ fleck) >>> 0;
                    const offsetX = (mixed & 255) / 255;
                    const offsetY = ((mixed >>> 8) & 255) / 255;
                    const share = 0.3 + 0.35 * (((mixed >>> 16) & 255) / 255);
                    this.foamGraphics.fillStyle(FOAM_COLOR, Math.min(0.9, 0.25 + 0.65 * strength));
                    this.foamGraphics.fillRect(
                        cellX * TERRAIN_CELL + offsetX * block * (1 - share),
                        cellY * TERRAIN_CELL + offsetY * block * (1 - share),
                        block * share,
                        block * share,
                    );
                }
            }
        }
        return cells > 0;
    }

    private clear(): void {
        this.foam.clear();
        this.breaking.clear();
        this.breakingVersion = -1;
        this.whitecaps.clear();
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
