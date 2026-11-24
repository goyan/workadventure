import type { WAMFileFormat } from "@workadventure/map-editor";
import { DEPTH_MAP_EDITOR_AREAS_INDEX } from "../DepthIndexes";
import type { WaterMark } from "./WaterMarks";
import { waterMarkLabel, waterMarkRadius, waterMarksOf } from "./WaterMarks";

/** A source is blue, a sink orange: neither is the colour of the water, the grass or the brush of the tool. */
const SOURCE_COLOR = 0x2f9bff;
const SINK_COLOR = 0xff8a1f;
const OUTLINE_COLOR = 0x10202c;
const SIGN_COLOR = 0xffffff;
/** The objects of the map are read again this often: another editor may set a source while the tool is open. */
const MARKS_MS = 1000;
/** The halo of a mark beats this often, drawn 15 times a second; it stands still for who asked for less motion. */
const PULSE_MS = 1600;
const FRAME_MS = 1000 / 15;
const REDUCED_MOTION = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * Points out every source and every sink of the map while the relief is edited: a coloured badge where its water
 * comes out or goes (+ for a source, − for a sink), a beating halo, the disc it pours over or takes from, and its
 * flow written under it. The badges keep their size on the screen at every zoom. Drawn for the editor only.
 */
export class WaterMarksView {
    private readonly graphics: Phaser.GameObjects.Graphics;
    private readonly labels: Phaser.GameObjects.Text[] = [];
    private marks: WaterMark[] = [];
    private marksReadAt = -Infinity;
    private lastFrameAt = -Infinity;
    /** What the last drawing was made of, for who asked for less motion: nothing is drawn again until it changes. */
    private drawnZoom = 0;
    private stale = true;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly wam: () => Pick<WAMFileFormat, "entities"> | undefined,
        private readonly reducedMotion = REDUCED_MOTION,
    ) {
        this.graphics = scene.add.graphics().setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
    }

    /** `now` in ms of the game. */
    public update(now: number): void {
        if (now - this.lastFrameAt < FRAME_MS) return;
        this.lastFrameAt = now;
        if (now - this.marksReadAt >= MARKS_MS) {
            this.marks = waterMarksOf(this.wam());
            this.marksReadAt = now;
            this.stale = true;
        }
        if (this.marks.length === 0 && this.labels.length === 0) return;
        const zoom = this.scene.cameras.main.zoom;
        if (this.reducedMotion && !this.stale && zoom === this.drawnZoom) return;
        this.drawnZoom = zoom;
        this.stale = false;
        const radius = waterMarkRadius(zoom);
        // What one pixel of the screen is worth on the map: the lines keep their width at every zoom.
        const pixel = radius / waterMarkRadius(1);
        const beat = this.reducedMotion ? 0.5 : (now % PULSE_MS) / PULSE_MS;
        const graphics = this.graphics;
        graphics.clear();
        this.marks.forEach((mark, index) => {
            const color = mark.kind === "source" ? SOURCE_COLOR : SINK_COLOR;
            // One that is turned off is paler.
            const strength = mark.litresPerMinute > 0 ? 1 : 0.55;
            if (mark.discPx > radius) {
                graphics.fillStyle(color, 0.12 * strength);
                graphics.fillCircle(mark.x, mark.y, mark.discPx);
                graphics.lineStyle(1.5 * pixel, color, 0.8 * strength);
                graphics.strokeCircle(mark.x, mark.y, mark.discPx);
            }
            graphics.lineStyle(2 * pixel, color, (1 - beat) * 0.9 * strength);
            graphics.strokeCircle(mark.x, mark.y, radius * (1 + beat * 1.2));
            graphics.fillStyle(OUTLINE_COLOR, 0.9);
            graphics.fillCircle(mark.x, mark.y, radius + 2 * pixel);
            graphics.fillStyle(color, strength);
            graphics.fillCircle(mark.x, mark.y, radius);
            const arm = radius * 0.55;
            const thick = Math.max(2 * pixel, radius * 0.22);
            graphics.fillStyle(SIGN_COLOR, 1);
            graphics.fillRect(mark.x - arm, mark.y - thick / 2, arm * 2, thick);
            if (mark.kind === "source") graphics.fillRect(mark.x - thick / 2, mark.y - arm, thick, arm * 2);
            this.labelAt(index)
                .setText(waterMarkLabel(mark))
                .setPosition(mark.x, mark.y + radius + 4 * pixel)
                .setScale(pixel)
                .setVisible(true);
        });
        for (const label of this.labels.slice(this.marks.length)) label.setVisible(false);
        this.scene.markDirty();
    }

    private labelAt(index: number): Phaser.GameObjects.Text {
        this.labels[index] ??= this.scene.add
            .text(0, 0, "", {
                fontSize: "11px",
                color: "#ffffff",
                stroke: "#10202c",
                strokeThickness: 3,
            })
            .setOrigin(0.5, 0)
            .setDepth(DEPTH_MAP_EDITOR_AREAS_INDEX);
        return this.labels[index];
    }

    public destroy(): void {
        this.graphics.destroy();
        for (const label of this.labels) label.destroy();
        this.labels.length = 0;
        this.scene.markDirty();
    }
}
