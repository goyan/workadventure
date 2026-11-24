import * as Phaser from "phaser";
import { shaderSeconds } from "../ShaderNoise";
import { windSeaUniforms } from "./WindSeaShader";
import type { SeaDrawing } from "./WindSeaShader";

/**
 * The foam the breaking crests of the wind sea leave on the water: a picture of it around the camera, kept on the
 * graphics card and made again a few times a second from itself (WIND_SEA_FOAM_GLSL), which the water shader reads.
 * Two pictures, one written from the other, in turn.
 *
 * The foam is a state of the page: it starts from nothing when the page opens or the camera jumps away, and builds up
 * in a few seconds (FOAM_DECAY_S); then it is the same for every player, the crests being the same.
 */

/** The size of each picture, in texels. */
export const FOAM_TEXELS = { across: 768, down: 512 } as const;
/** The map pixels a texel of the foam covers, the finest first: the first that holds the view and its margin. */
export const FOAM_STEPS_PX: readonly number[] = [2, 3, 4, 6, 8, 12, 16, 24, 32];
/** Around the view, so that the foam is there before a crest comes into it. */
const FOAM_MARGIN_PX = 64;
/** How often the foam is made again, a second; less on a modest graphics card (graphics quality « Medium »). */
export const FOAM_HZ = 15;
export const COARSE_FOAM_HZ = 10;
/** A longer wait than this (a hidden tab, a stall) counts as this: the foam would be gone by then anyway. */
const LONGEST_STEP_S = 1;

/** The part of the map a picture of the foam covers: map pixels. */
export interface FoamArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The part of the map the next picture of the foam covers, for the view of the camera: centred on it, on whole texels
 * of its step (the foam moved by whole texels from a picture to the next is not blurred), the finest step that holds
 * the view and its margin; a coarser one at least (`coarse`) on a modest graphics card.
 */
export function foamArea(
    view: { x: number; y: number; width: number; height: number },
    coarse: boolean,
): FoamArea & { step: number } {
    const wanted = { width: view.width + 2 * FOAM_MARGIN_PX, height: view.height + 2 * FOAM_MARGIN_PX };
    const steps = coarse ? FOAM_STEPS_PX.filter((step) => step >= 4) : FOAM_STEPS_PX;
    const step =
        steps.find((each) => each * FOAM_TEXELS.across >= wanted.width && each * FOAM_TEXELS.down >= wanted.height) ??
        steps[steps.length - 1];
    const width = step * FOAM_TEXELS.across;
    const height = step * FOAM_TEXELS.down;
    const x = Math.floor((view.x + view.width / 2 - width / 2) / step) * step;
    const y = Math.floor((view.y + view.height / 2 - height / 2) / step) * step;
    return { x, y, width, height, step };
}

/** Whether the foam is made again at `nowMs`, the last picture made at `lastMs` (undefined: none yet). */
export function foamIsDue(nowMs: number, lastMs: number | undefined, coarse: boolean): boolean {
    return lastMs === undefined || nowMs - lastMs >= 1000 / (coarse ? COARSE_FOAM_HZ : FOAM_HZ) - 0.5;
}

/** The seconds the foam moves and fades over, from the picture before: never over LONGEST_STEP_S. */
export function foamStepSeconds(nowMs: number, lastMs: number | undefined): number {
    if (lastMs === undefined) return 0;
    return Math.min(LONGEST_STEP_S, Math.max(0, (nowMs - lastMs) / 1000));
}

let foamCount = 0;

export class WindSeaFoam {
    private readonly keys: [string, string];
    private readonly shaders: [Phaser.GameObjects.Shader, Phaser.GameObjects.Shader];
    /** The picture written last (0 or 1): the one the water reads. */
    private current = 0;
    private area: FoamArea | undefined;
    private before: FoamArea | undefined;
    private lastMs: number | undefined;
    private count = 0;
    private step = { seconds: 0, fresh: true };
    private sea: SeaDrawing | undefined;

    /**
     * `fragmentSource`: the whole shader of the pass (the GLSL of the ground, WIND_SEA_GLSL, WIND_SEA_FOAM_GLSL).
     * `ground`: sets the uniforms of the ground the pass reads (the weights, their area), its texture second.
     * `airKey`: the picture of the wind of the air of a hurricane, its texture third.
     */
    public constructor(
        private readonly scene: Phaser.Scene,
        fragmentSource: string,
        private readonly groundKey: () => string,
        /** The picture of the wind of the air of a hurricane (SeaAir), its texture third. */
        private readonly airKey: () => string,
        private readonly ground: (setUniform: (name: string, value: unknown) => void) => void,
    ) {
        const id = ++foamCount;
        this.keys = [`wind-sea-foam-${id}-a`, `wind-sea-foam-${id}-b`];
        const make = (at: number): Phaser.GameObjects.Shader => {
            const shader = new Phaser.GameObjects.Shader(
                scene,
                {
                    name: `WindSeaFoam${at}`,
                    fragmentSource,
                    setupUniforms: (setUniform: (name: string, value: unknown) => void) => this.setUniforms(setUniform),
                },
                0,
                0,
                FOAM_TEXELS.across,
                FOAM_TEXELS.down,
                ["__DEFAULT", "__DEFAULT", "__DEFAULT"],
            );
            shader.setOrigin(0);
            // Drawn once into its picture here, from nothing: the step says so.
            shader.setRenderToTexture(this.keys[at]);
            // Read smooth between its texels (the game draws its pictures sharp, pixel art): the foam moved by less
            // than a texel at each picture drifts on, and the crests that pass lay a trail, not a row of dots.
            scene.textures.get(this.keys[at]).setFilter(Phaser.Textures.FilterMode.LINEAR);
            return shader;
        };
        this.shaders = [make(0), make(1)];
    }

    /** The key of the picture of the foam the water reads, and the part of the map it covers; undefined: none. */
    public shown(): { key: string; area: FoamArea } | undefined {
        return this.area ? { key: this.keys[this.current], area: this.area } : undefined;
    }

    /**
     * Makes the foam again when it is due, for the sea drawn now and the view of the camera: true when a new picture
     * was made (the water should read it). No sea: the foam is forgotten, to start from nothing when the wind rises.
     */
    public update(
        nowMs: number,
        sea: SeaDrawing | undefined,
        view: { x: number; y: number; width: number; height: number },
        coarse: boolean,
    ): boolean {
        if (!sea || !Number.isFinite(sea.breakingSlope)) {
            const had = this.area !== undefined;
            this.area = undefined;
            this.lastMs = undefined;
            return had;
        }
        if (!foamIsDue(nowMs, this.lastMs, coarse)) return false;
        const next = foamArea(view, coarse);
        const fresh = this.area === undefined || this.lastMs === undefined;
        this.step = { seconds: foamStepSeconds(nowMs, this.lastMs), fresh };
        this.before = this.area;
        this.area = { x: next.x, y: next.y, width: next.width, height: next.height };
        this.sea = sea;
        this.lastMs = nowMs;
        this.count = (this.count + 1) % 4096;
        const written = 1 - this.current;
        const shader = this.shaders[written];
        shader.setTextures([this.keys[this.current], this.groundKey(), this.airKey()]);
        shader.renderImmediate();
        this.current = written;
        return true;
    }

    private setUniforms(setUniform: (name: string, value: unknown) => void): void {
        this.ground(setUniform);
        setUniform("uFoamBefore", 0);
        setUniform("uHurAirTex", 2);
        const area = this.area ?? { x: 0, y: 0, width: 1, height: 1 };
        const before = this.before ?? area;
        setUniform("uFoamArea", [area.x, area.y, area.width, area.height]);
        setUniform("uFoamBeforeArea", [before.x, before.y, before.width, before.height]);
        setUniform("uFoamTexels", [FOAM_TEXELS.across, FOAM_TEXELS.down]);
        const sea = this.area ? this.sea : undefined;
        setUniform("uFoamStep", [
            this.step.seconds,
            this.count,
            sea?.left.cutShift ?? 0,
            this.step.fresh || !this.before ? 1 : 0,
        ]);
        setUniform("uFoamLife", sea?.left.life ?? 1);
        for (const [name, value] of windSeaUniforms(sea, shaderSeconds(this.lastMs ?? this.scene.time.now))) {
            setUniform(name, value);
        }
    }

    public destroy(): void {
        for (const shader of this.shaders) shader.destroy();
        for (const key of this.keys) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    }
}
