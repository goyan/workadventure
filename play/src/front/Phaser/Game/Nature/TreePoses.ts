import type * as Phaser from "phaser";

/** Wind (km/h) from which the trees sway as much and as fast as they ever do. */
const STRONGEST_WIND_KMH = 80;
/** How wide the swing of a tree is, in its own unit: a little in a calm, ten times more in a storm. */
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

/** The furthest pose: how many pixels the top of a tree moves to a side at most. */
export const MAX_POSE = 4;
/** Room added on each side of a bent image for its top to move into. */
export const POSE_PAD = MAX_POSE;
/** How far the top sways each way around where it leans, in pixels: a little in a calm, more in a storm. */
const CALM_SWAY = 0.8;
const STORM_SWAY = 2.5;
/** How far the strongest wind keeps the top leaning to its side, in pixels. */
const STORM_LEAN = 2.5;
/** The trunk, which does not move: the bottom of the image, from this share of its height down. */
const TRUNK_FROM = 0.7;
/** How the foliage bends: hardly above the trunk, more and more towards the top. */
const BEND = 1.3;
const DEG = Math.PI / 180;

/**
 * The pose of a tree `seconds` into the server time: how many pixels its top stands to the right (negative: to the
 * left). The tree leans where the wind goes (`windFrom`: where it comes from, degrees, 0 north) and sways around that,
 * both the more the harder it blows. `phase` (0 to 1) sets each tree in its own time. The same for everyone.
 */
export function treePose(seconds: number, windKmh: number, windFrom: number | undefined, phase: number): number {
    if (!Number.isFinite(seconds)) return 0;
    const share = windShare(windKmh);
    // Where the wind goes, left to right: a north-west wind without a real one, as the clouds.
    const side = windFrom === undefined ? Math.SQRT1_2 : -Math.sin(windFrom * DEG);
    const wave = treeSwayAngle(seconds, windKmh, phase) / swayAmplitude(windKmh);
    const top = side * share * STORM_LEAN + (CALM_SWAY + (STORM_SWAY - CALM_SWAY) * share) * wave;
    return Math.max(-MAX_POSE, Math.min(MAX_POSE, Math.round(top))) || 0;
}

/**
 * How many pixels the row `row` (0 at the top) of an image `height` rows high moves to the right in the pose `pose`:
 * nothing for the trunk, the whole pose at the top, whole pixels in between so the picture stays sharp.
 */
export function poseRowShift(pose: number, row: number, height: number): number {
    const trunk = height * TRUNK_FROM;
    if (row >= trunk) return 0;
    const shift = Math.round(Math.abs(pose) * Math.pow((trunk - row) / trunk, BEND));
    return shift === 0 ? 0 : Math.sign(pose) * shift;
}

/**
 * The bent images of the trees: for a tree image and a pose, the same picture with its rows moved, made once in the
 * browser and kept. Nothing is turned or scaled, so the pixels stay as drawn.
 */
export class TreePoseTextures {
    /** Bent texture key per image and pose, or undefined when the image cannot be read. */
    private readonly keys = new Map<string, string | undefined>();

    constructor(private readonly scene: Phaser.Scene) {}

    /**
     * Key of the texture showing `textureKey` in the pose `pose`: `POSE_PAD` pixels wider on each side than the
     * original. Undefined for a tree standing straight (its own image fits) or an image that cannot be bent.
     */
    public key(textureKey: string, pose: number): string | undefined {
        if (pose === 0) return undefined;
        const key = `tree-pose:${textureKey}:${pose}`;
        if (this.keys.has(key)) return this.keys.get(key);
        this.keys.set(key, undefined);
        const frame = this.scene.textures.getFrame(textureKey);
        const source = frame?.source.image;
        if (!frame || !source) return undefined;
        const { cutX, cutY, cutWidth: width, cutHeight: height } = frame;
        const canvas = this.scene.textures.createCanvas(key, width + 2 * POSE_PAD, height);
        const context = canvas?.getContext();
        if (!canvas || !context) return undefined;
        // Rows moving by the same amount are drawn together, as one band.
        let from = 0;
        for (let row = 1; row <= height; row++) {
            const shift = poseRowShift(pose, from, height);
            if (row < height && poseRowShift(pose, row, height) === shift) continue;
            context.drawImage(source, cutX, cutY + from, width, row - from, POSE_PAD + shift, from, width, row - from);
            from = row;
        }
        canvas.refresh();
        this.keys.set(key, key);
        return key;
    }

    public destroy(): void {
        for (const key of this.keys.values()) {
            if (key && this.scene.textures.exists(key)) this.scene.textures.remove(key);
        }
        this.keys.clear();
    }
}
