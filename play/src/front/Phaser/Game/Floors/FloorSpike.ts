import * as Phaser from "phaser";
import {
    SPIKE_TILE,
    platformHidesAvatar,
    platformScreenBox,
    spikeLayout,
    spikeRoomLayout,
    spikeStep,
    stairScreenBox,
} from "./FloorSpikeGeometry";
import type { Pt, SpikeLayout, SpikeState } from "./FloorSpikeGeometry";

/** THROWAWAY SPIKE (not to be committed), enabled by `?palier=1` or `?palier=<cellX>,<cellY>`. */
export interface SpikeAvatar {
    x: number;
    y: number;
    setPosition(x: number, y: number): unknown;
    setFloorZ(z: number): void;
}

/** Everything standing on a raised floor is drawn over everything standing lower. */
export const FLOOR_LEVEL_DEPTH = 300_000;
/** The point read for the avatar, under its centre: between its feet. */
const FEET_OFFSET_Y = 12;
const HIDDEN_ALPHA = 0.35;
const FADE_MS = 200;

export class FloorSpike {
    private layout: SpikeLayout | undefined;
    private state: SpikeState = { on: "ground", z: 0 };
    private prev: Pt | undefined;
    private readonly platform: Phaser.GameObjects.Graphics;
    private readonly stairs: Phaser.GameObjects.Graphics[] = [];
    private readonly label: Phaser.GameObjects.Text;

    constructor(
        private readonly scene: Phaser.Scene & { markDirty(): void },
        private readonly avatar: () => SpikeAvatar | undefined,
        private readonly origin: string,
    ) {
        this.platform = scene.add.graphics().setDepth(FLOOR_LEVEL_DEPTH);
        this.label = scene.add.text(0, 0, "", { fontSize: "10px", color: "#ffffff", backgroundColor: "#000000" });
        this.label.setDepth(FLOOR_LEVEL_DEPTH * 2);
        scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.step);
    }

    public destroy(): void {
        this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.step);
        this.platform.destroy();
        for (const stair of this.stairs) stair.destroy();
        this.label.destroy();
    }

    /** For the tests in the browser. */
    public debug(): { state: SpikeState; layout: SpikeLayout | undefined; alpha: number } {
        return { state: this.state, layout: this.layout, alpha: this.platform.alpha };
    }

    private readonly step = (_time: number, delta: number): void => {
        const avatar = this.avatar();
        if (!avatar) return;
        const p = { x: avatar.x, y: avatar.y + FEET_OFFSET_Y };
        if (!this.layout) {
            const cells = this.origin.split(",").map((value) => Number.parseInt(value, 10));
            const given = cells.length === 2 && cells.every((value) => Number.isFinite(value));
            this.layout =
                this.origin === "piece"
                    ? spikeRoomLayout()
                    : given
                      ? spikeLayout(cells[0], cells[1])
                      : spikeLayout(Math.floor(p.x / SPIKE_TILE), Math.floor(p.y / SPIKE_TILE));
            this.draw(this.layout);
        }
        const result = spikeStep(this.layout, this.state, this.prev ?? p, p);
        if (result.p.x !== p.x || result.p.y !== p.y) {
            avatar.setPosition(result.p.x, result.p.y - FEET_OFFSET_Y);
        }
        this.prev = result.p;
        this.state = result.state;
        avatar.setFloorZ(result.state.z);

        const target = platformHidesAvatar(this.layout, this.state, result.p) ? HIDDEN_ALPHA : 1;
        if (this.platform.alpha !== target) {
            const change = ((1 - HIDDEN_ALPHA) * delta) / FADE_MS;
            const alpha = this.platform.alpha;
            this.platform.setAlpha(
                target > alpha ? Math.min(target, alpha + change) : Math.max(target, alpha - change),
            );
            this.scene.markDirty();
        }
        this.label.setPosition(result.p.x + 14, result.p.y - 44);
        this.label.setText(`${String(this.state.on)} z=${Math.round(this.state.z)}`);
    };

    private draw(layout: SpikeLayout): void {
        const z = layout.z;
        for (const stair of layout.stairs) {
            const g = stair.ground;
            // A stair stands on the ground: sorted by its foot like an object, over the floors and the pools.
            const stairs = this.scene.add.graphics().setDepth(g.y + g.height);
            this.stairs.push(stairs);
            const steps = 12;
            if (stair.dir === "e") {
                for (let i = 0; i < steps; i++) {
                    stairs.fillStyle(i % 2 === 0 ? 0x8d7b5a : 0xa8956e, 1);
                    // The front of each step, down to the ground, then its top.
                    const top = g.y - (z * (i + 1)) / steps;
                    stairs.fillRect(
                        g.x + (g.width * i) / steps,
                        top,
                        g.width / steps,
                        g.height + (z * (i + 1)) / steps,
                    );
                    stairs.fillStyle(i % 2 === 0 ? 0xc9b68c : 0xd8c79f, 1);
                    stairs.fillRect(g.x + (g.width * i) / steps, top, g.width / steps, g.height);
                }
                continue;
            }
            const box = stairScreenBox(stair, z);
            for (let i = 0; i < steps; i++) {
                stairs.fillStyle(i % 2 === 0 ? 0xc9b68c : 0xa8956e, 1);
                stairs.fillRect(box.x, box.y + (box.height * i) / steps, box.width, box.height / steps + 0.5);
            }
            stairs.lineStyle(2, 0x5b4c33, 1);
            stairs.strokeRect(box.x, box.y, box.width, box.height);
        }

        const screen = platformScreenBox(layout);
        const slab = this.platform;
        slab.fillStyle(0xbfa97c, 1);
        slab.fillRect(screen.x, screen.y, screen.width, screen.height);
        slab.lineStyle(1, 0x9c875f, 1);
        for (let x = screen.x; x <= screen.x + screen.width; x += SPIKE_TILE) {
            slab.lineBetween(x, screen.y, x, screen.y + screen.height);
        }
        for (let y = screen.y; y <= screen.y + screen.height; y += SPIKE_TILE) {
            slab.lineBetween(screen.x, y, screen.x + screen.width, y);
        }
        // The thickness of the slab, seen from the south, and two posts down to the ground.
        slab.fillStyle(0x6f5d3e, 1);
        slab.fillRect(screen.x, screen.y + screen.height, screen.width, 8);
        slab.fillRect(screen.x, screen.y + screen.height + 8, 4, z - 8);
        slab.fillRect(screen.x + screen.width - 4, screen.y + screen.height + 8, 4, z - 8);
        slab.lineStyle(2, 0x3f3421, 1);
        slab.strokeRect(screen.x, screen.y, screen.width, screen.height);
        this.scene.markDirty();
    }
}
