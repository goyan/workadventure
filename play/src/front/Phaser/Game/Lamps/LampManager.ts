import { DEPTH_NIGHT_INDEX } from "../DepthIndexes";
import type { GameScene } from "../GameScene";
import type { LampSignalSource } from "./LampSignal";
import { SpectrumSignalSource } from "./LampSignal";
import { syntheticSpectrum } from "./SyntheticBeat";
import { createLamp, type LampKind, type LampVisual } from "./LampVisuals";
import { ensureLampTextures } from "./LampTextures";

/** Above the night veil: lamps glow at night, and are a light touch by day. */
const LAMP_DEPTH = DEPTH_NIGHT_INDEX + 100;
const DEMO_KINDS: LampKind[] = ["spot", "disco", "neon", "strobe"];
/** Tiles are 32 px: the demo lamps stand three tiles above the player, a lamp every three tiles. */
const DEMO_SPACING_PX = 96;
const DEMO_OFFSET_Y_PX = -96;

/**
 * Lamps that follow the music. For now a prototype: `?lampDemo` puts one lamp of each kind near the player, lit by a
 * made-up beat, to judge the look without a Jam. Lamps read their frame from a signal source, so the music of a Jam
 * can take the place of the made-up one without touching the visuals.
 */
export class LampManager {
    private readonly lamps: LampVisual[] = [];
    private readonly signal: LampSignalSource;
    private readonly reducedMotion: boolean;

    constructor(
        private readonly scene: GameScene,
        options: { demo: { bpm: number } },
    ) {
        ensureLampTextures(scene);
        this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        this.signal = new SpectrumSignalSource((now) => syntheticSpectrum(now, options.demo.bpm));
        const { x, y } = scene.CurrentPlayer;
        const first = x - ((DEMO_KINDS.length - 1) * DEMO_SPACING_PX) / 2;
        DEMO_KINDS.forEach((kind, index) => {
            this.lamps.push(
                createLamp(kind, {
                    scene,
                    x: first + index * DEMO_SPACING_PX,
                    y: y + DEMO_OFFSET_Y_PX,
                    depth: LAMP_DEPTH,
                    reducedMotion: this.reducedMotion,
                }),
            );
        });
    }

    public update(now: number): void {
        const frame = this.signal.read(now);
        for (const lamp of this.lamps) {
            lamp.update(frame, now);
        }
        // The scene is only drawn when something changed: lamps change at every image.
        this.scene.markDirty();
    }

    public destroy(): void {
        for (const lamp of this.lamps) {
            lamp.destroy();
        }
        this.lamps.length = 0;
    }
}
