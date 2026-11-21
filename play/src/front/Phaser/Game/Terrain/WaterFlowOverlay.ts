import type * as Phaser from "phaser";
import { TERRAIN_CELL } from "@workadventure/map-editor";
import type { TerrainData, WaveSettings } from "@workadventure/map-editor";
import { DEPTH_INGAME_TEXT_INDEX } from "../DepthIndexes";
import type { SettledWater } from "./TerrainWater";
import { flowOverBlock, flowSpeedColor } from "./WaterFlowField";
import { waterMassesOf } from "./WaterMasses";
import type { WaterMass } from "./WaterMasses";

export interface WaterFlowOverlayOptions {
    /** The water of the relief: its last state, and a number that changes with it. */
    water: {
        /** With `now` (ms of the game), the trend of the level too: kept while it is read so. */
        settled(now?: number): SettledWater;
        /** The view is closed: the trend is let go. */
        dropTrend?(): void;
        relief(): TerrainData | undefined;
        basin?(): TerrainData | undefined;
        version(): number;
        hasAnything(): boolean;
    };
    /** Whether the water of the map has inertia: how fast it runs down a slope depends on it. */
    inertia: () => boolean;
    /** How that water makes its waves, when the map says: the friction that holds it back. */
    waves?: () => WaveSettings | undefined;
    /** How fast that water flows next to reality (1 when the map says nothing): the speeds shown follow it. */
    pace?: () => number | undefined;
    /** Whether the overlay is asked for. */
    shown: () => boolean;
    /** Told whether the speeds shown are those the server computes, or guessed from the slope of the surface. */
    measured?: (measured: boolean) => void;
}

/** Over the night and the lights, so that it reads at any hour; under the names and the interface. */
const OVERLAY_DEPTH = DEPTH_INGAME_TEXT_INDEX - 20;
/** Drawn ten times a second: the dots that run along the arrows are what moves. */
const FRAME_MS = 100;
/** About how far apart two arrows are on the screen, in screen pixels. */
const ARROW_SPACING = 44;
/** Never more arrows than this on the screen. */
const MOST_ARROWS = 3000;
/** Water slower than this, in metres a second, has no arrow. */
const SLOWEST_SHOWN = 0.03;
/** An arrow is as long as its block allows from this speed on, in metres a second. */
const FULL_ARROW_SPEED = 2;
/**
 * The tint of a level that rises or falls (its trend over a few seconds, WaterTrend: under its threshold, none) is
 * full from this trend on, in pixels a second: 0.5 px a second is 1.7 cm a second, a metre a minute.
 */
const FULL_TREND = 0.5;
export const RISING_COLOR = 0x3b82f6;
export const FALLING_COLOR = 0xd946ef;
/** The labels of the largest bodies of water in view, no more than this many. */
const MOST_LABELS = 8;
/** The bodies of water are read again no more often than this: reading them goes through the whole grid. */
const MASSES_MS = 1000;

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const tenth = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** A volume or a surface: no decimals from ten on. */
const amount = (value: number): string => (Math.abs(value) >= 10 ? whole.format(value) : tenth.format(value));

/** What the label of a body of water says: its volume, its surface, its mean depth, and how fast it fills. */
export function massLabel(mass: WaterMass): string {
    const trend = mass.trendM3PerMinute;
    const steady = Math.abs(trend) < Math.max(0.05, mass.volumeM3 * 0.0005);
    const told = steady ? "=" : `${trend > 0 ? "▲ +" : "▼ −"}${amount(Math.abs(trend))} m³/min`;
    return `${amount(mass.volumeM3)} m³ · ${amount(mass.areaM2)} m² · ${tenth.format(mass.meanDepthM)} m\n${told}`;
}

/**
 * Draws the flows of the water over the map, for whoever asked: an arrow where the water runs (which way, and how
 * fast by its length and its colour), with a dot that runs along it; a tint where the level rises or falls over a
 * few seconds (its trend, the ripple of the waves left out); and a label on each body of water (volume, surface,
 * mean depth, trend). Read from the depths this browser already has: nothing is asked of the server, and the speeds
 * are those the slope of the surface gives.
 */
export class WaterFlowOverlay {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly labels: Phaser.GameObjects.Text[] = [];
    private masses: WaterMass[] = [];
    private massesVersion = -1;
    private massesReadAt = -Infinity;
    private lastFrameAt = -Infinity;
    private drawn = false;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly options: WaterFlowOverlayOptions,
    ) {
        this.graphics = scene.add.graphics().setDepth(OVERLAY_DEPTH);
    }

    /** `now` in ms of the game. */
    public update(now: number): void {
        if (!this.options.shown() || !this.options.water.hasAnything()) {
            this.clear();
            return;
        }
        if (now - this.lastFrameAt < FRAME_MS) return;
        this.lastFrameAt = now;
        const water = this.options.water.settled(now);
        this.options.measured?.(water.speedAt !== undefined);
        const terrain = this.options.water.basin ? this.options.water.basin() : this.options.water.relief();
        const inertia = this.options.inertia();
        const waves = this.options.waves?.();
        const pace = inertia ? (this.options.pace?.() ?? 1) : 1;
        const camera = this.scene.cameras.main;
        const view = camera.worldView;
        const zoom = camera.zoom > 0 ? camera.zoom : 1;
        // One arrow for a block of cells, larger when seen from far.
        let size = Math.max(1, Math.ceil(ARROW_SPACING / (TERRAIN_CELL * zoom)));
        const blocksAt = (side: number): number =>
            (Math.ceil(view.width / (side * TERRAIN_CELL)) + 1) * (Math.ceil(view.height / (side * TERRAIN_CELL)) + 1);
        while (blocksAt(size) > MOST_ARROWS) size++;
        const block = size * TERRAIN_CELL;
        const firstX = Math.max(water.x, Math.floor(view.x / block) * size);
        const firstY = Math.max(water.y, Math.floor(view.y / block) * size);
        const lastX = Math.min(water.x + water.width, Math.ceil((view.x + view.width) / TERRAIN_CELL));
        const lastY = Math.min(water.y + water.height, Math.ceil((view.y + view.height) / TERRAIN_CELL));
        const graphics = this.graphics;
        graphics.clear();
        const line = 2.5 / zoom;
        const seconds = now / 1000;
        for (let cellY = firstY; cellY < lastY; cellY += size) {
            for (let cellX = firstX; cellX < lastX; cellX += size) {
                const flow = flowOverBlock(water, terrain, cellX, cellY, size, inertia, waves);
                if (flow.depth <= 0) continue;
                // What is seen on the map: the real speed of that water, times the pace the map sets for its flow
                // (the speeds the server tells are already those seen).
                if (!water.speedAt) flow.speed *= pace;
                const left = cellX * TERRAIN_CELL;
                const top = cellY * TERRAIN_CELL;
                // The trend of the level, not the ripple of its waves: paler when it rises slowly.
                if (flow.tint !== 0) {
                    graphics.fillStyle(
                        flow.tint > 0 ? RISING_COLOR : FALLING_COLOR,
                        0.12 + 0.33 * Math.min(1, Math.abs(flow.trend) / FULL_TREND),
                    );
                    graphics.fillRect(left, top, block, block);
                }
                if (flow.speed < SLOWEST_SHOWN) continue;
                const middleX = left + block / 2;
                const middleY = top + block / 2;
                const length = block * (0.35 + 0.55 * Math.min(1, flow.speed / FULL_ARROW_SPEED));
                const fromX = middleX - (flow.x * length) / 2;
                const fromY = middleY - (flow.y * length) / 2;
                const toX = middleX + (flow.x * length) / 2;
                const toY = middleY + (flow.y * length) / 2;
                const color = flowSpeedColor(flow.speed);
                // A dark line under the coloured one: an arrow reads on pale water as on dark ground.
                graphics.lineStyle(line * 2.2, 0x0b1320, 0.6);
                graphics.lineBetween(fromX, fromY, toX, toY);
                graphics.lineStyle(line, color, 0.95);
                graphics.lineBetween(fromX, fromY, toX, toY);
                const head = Math.min(length * 0.45, 9 / zoom);
                // The two barbs of the head, 30 degrees on each side of the shaft.
                for (const turn of [0.5, -0.5]) {
                    const cos = Math.cos(turn);
                    const sin = Math.sin(turn);
                    graphics.lineBetween(
                        toX,
                        toY,
                        toX - (flow.x * cos - flow.y * sin) * head,
                        toY - (flow.x * sin + flow.y * cos) * head,
                    );
                }
                // The dot runs along the arrow, faster in faster water, each arrow out of step with the next.
                const along = (seconds * (0.35 + flow.speed * 0.6) + ((cellX * 7 + cellY * 13) % 10) / 10) % 1;
                graphics.fillStyle(0xffffff, 0.95);
                graphics.fillCircle(fromX + (toX - fromX) * along, fromY + (toY - fromY) * along, 2.4 / zoom);
            }
        }
        this.placeLabels(water, now, view, zoom);
        this.drawn = true;
        this.scene.markDirty();
    }

    /** The labels of the largest bodies of water in view, always the same size on the screen. */
    private placeLabels(water: SettledWater, now: number, view: Phaser.Geom.Rectangle, zoom: number): void {
        const version = this.options.water.version();
        // Read again when the water changed, and while a trend is still dying down after the server fell silent.
        const settling = this.masses.some((mass) => Math.abs(mass.trendM3PerMinute) >= 0.01);
        if ((version !== this.massesVersion || settling) && now - this.massesReadAt >= MASSES_MS) {
            this.masses = waterMassesOf(water);
            this.massesVersion = version;
            this.massesReadAt = now;
        }
        let used = 0;
        for (const mass of this.masses) {
            if (used >= MOST_LABELS) break;
            if (mass.x < view.x || mass.y < view.y || mass.x > view.right || mass.y > view.bottom) continue;
            let label = this.labels[used];
            if (!label) {
                label = this.scene.add.text(0, 0, "", {
                    fontSize: "12px",
                    color: "#ffffff",
                    backgroundColor: "#0b1320cc",
                    padding: { x: 5, y: 3 },
                    align: "center",
                });
                label.setOrigin(0.5, 0.5).setDepth(OVERLAY_DEPTH + 1);
                this.labels[used] = label;
            }
            label
                .setText(massLabel(mass))
                .setPosition(mass.x, mass.y)
                .setScale(1 / zoom)
                .setVisible(true);
            used++;
        }
        for (let index = used; index < this.labels.length; index++) this.labels[index].setVisible(false);
    }

    private clear(): void {
        if (!this.drawn) return;
        this.options.water.dropTrend?.();
        this.masses = [];
        this.graphics.clear();
        for (const label of this.labels) label.setVisible(false);
        this.drawn = false;
        this.lastFrameAt = -Infinity;
        this.massesVersion = -1;
        this.scene.markDirty();
    }

    public destroy(): void {
        this.graphics.destroy();
        for (const label of this.labels) label.destroy();
        this.labels.length = 0;
    }
}
