import * as Phaser from "phaser";

export const LAMP_DISC_TEXTURE = "lamp-soft-disc";
export const LAMP_BEAM_TEXTURE = "lamp-beam";
export const LAMP_TUBE_TEXTURE = "lamp-tube";
export const LAMP_BALL_TEXTURE = "lamp-ball";

/** Draws a white texture, pixel by pixel, from its opacity at each texel (0 to 1): no asset to ship. */
function makeWhiteTexture(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
    alphaAt: (x: number, y: number) => number,
): void {
    if (scene.textures.exists(key)) {
        return;
    }
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) {
        return;
    }
    const context = texture.getContext();
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            image.data[offset] = 255;
            image.data[offset + 1] = 255;
            image.data[offset + 2] = 255;
            image.data[offset + 3] = Math.round(Math.min(1, Math.max(0, alphaAt(x + 0.5, y + 0.5))) * 255);
        }
    }
    context.putImageData(image, 0, 0);
    texture.refresh();
    // The game runs without antialiasing (nearest filtering): a soft light must be smoothed all the same.
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** The few shapes every lamp is drawn with, generated once and shared. Light is drawn in additive blending. */
export function ensureLampTextures(scene: Phaser.Scene): void {
    // Soft disc: opaque at the centre, gone at the edge.
    const disc = 128;
    makeWhiteTexture(scene, LAMP_DISC_TEXTURE, disc, disc, (x, y) => {
        const t = Math.min(1, Math.hypot(x - disc / 2, y - disc / 2) / (disc / 2));
        return Math.exp(-2.5 * t * t) * (1 - smoothstep(0.75, 1, t));
    });

    // Beam: a cone from a point at the top middle, widening and fading as it goes down.
    const beamWidth = 64;
    const beamLength = 256;
    makeWhiteTexture(scene, LAMP_BEAM_TEXTURE, beamWidth, beamLength, (x, y) => {
        const along = y / beamLength;
        const halfWidth = Math.max(0.5, (along * beamWidth) / 2);
        const across = Math.abs(x - beamWidth / 2) / halfWidth;
        return across >= 1 ? 0 : Math.exp(-4 * across * across) * (1 - smoothstep(0.7, 1, across)) * (1 - along) ** 1.2;
    });

    // Tube: a capsule with a bright core and a soft edge, for the neon.
    const tubeWidth = 96;
    const tubeHeight = 16;
    makeWhiteTexture(scene, LAMP_TUBE_TEXTURE, tubeWidth, tubeHeight, (x, y) => {
        const radius = tubeHeight / 2;
        const clampedX = Math.min(tubeWidth - radius, Math.max(radius, x));
        const distance = Math.hypot(x - clampedX, y - radius) / radius;
        return 1 - smoothstep(0.55, 1, distance);
    });

    // Ball: a disc with a highlight, for the mirror ball.
    const ball = 32;
    makeWhiteTexture(scene, LAMP_BALL_TEXTURE, ball, ball, (x, y) => {
        const distance = Math.hypot(x - ball / 2, y - ball / 2) / (ball / 2);
        const body = 1 - smoothstep(0.85, 1, distance);
        const highlight = 1 - smoothstep(0, 0.45, Math.hypot(x - ball * 0.38, y - ball * 0.36) / (ball / 2));
        return body * (0.55 + 0.45 * highlight);
    });
}
