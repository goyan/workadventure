import * as Phaser from "phaser";

export const LAMP_DISC_TEXTURE = "lamp-soft-disc";
export const LAMP_BEAM_TEXTURE = "lamp-beam";
export const LAMP_TUBE_TEXTURE = "lamp-tube";
export const LAMP_BALL_TEXTURE = "lamp-ball";
export const LAMP_SOFT_RECT_TEXTURE = "lamp-soft-rect";
/** Width of the soft edge of LAMP_SOFT_RECT_TEXTURE: a nine-slice keeps it at this size whatever the stretch. */
export const LAMP_SOFT_EDGE_PX = 24;

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
    ensureMirrorBallTexture(scene);
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

    // Soft rectangle: opaque inside, fading to nothing over its last LAMP_SOFT_EDGE_PX. Clipping light with a hard
    // rectangle left straight bright edges on the floor; a nine-slice of this keeps the fade at any zone size.
    const rect = LAMP_SOFT_EDGE_PX * 2 + 2;
    makeWhiteTexture(scene, LAMP_SOFT_RECT_TEXTURE, rect, rect, (x, y) =>
        smoothstep(0, LAMP_SOFT_EDGE_PX, Math.min(x, y, rect - x, rect - y)),
    );

    // Ball: a disc with a highlight, for the mirror ball.
    const ball = 32;
    makeWhiteTexture(scene, LAMP_BALL_TEXTURE, ball, ball, (x, y) => {
        const distance = Math.hypot(x - ball / 2, y - ball / 2) / (ball / 2);
        const body = 1 - smoothstep(0.85, 1, distance);
        const highlight = 1 - smoothstep(0, 0.45, Math.hypot(x - ball * 0.38, y - ball * 0.36) / (ball / 2));
        return body * (0.55 + 0.45 * highlight);
    });
}

export const LAMP_MIRROR_BALL_TEXTURE = "lamp-mirror-ball";
/** One turn of the mirror ball, one facet column per image: the last image leads seamlessly back to the first. */
export const MIRROR_BALL_FRAMES = 24;
const MIRROR_BALL_SIZE = 48;
const MIRROR_BALL_ROWS = 12;

/** A stable pseudo-random value in [0, 1) for a facet: every client draws the same ball. */
function facetNoise(column: number, row: number): number {
    const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
    return value - Math.floor(value);
}

/**
 * A mirror ball turning on itself, in MIRROR_BALL_FRAMES images side by side: silver facets lit from the top left, a
 * dark seam between them, and the facets facing the light flashing white as they pass, like a real one.
 */
export function ensureMirrorBallTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(LAMP_MIRROR_BALL_TEXTURE)) {
        return;
    }
    const size = MIRROR_BALL_SIZE;
    const texture = scene.textures.createCanvas(LAMP_MIRROR_BALL_TEXTURE, size * MIRROR_BALL_FRAMES, size);
    if (!texture) {
        return;
    }
    const context = texture.getContext();
    const image = context.createImageData(size * MIRROR_BALL_FRAMES, size);
    const radius = size / 2 - 1;
    const columnAngle = (2 * Math.PI) / MIRROR_BALL_FRAMES;
    const rowAngle = Math.PI / MIRROR_BALL_ROWS;
    const light = normalize([-0.45, -0.55, 0.7]);
    const halfway = normalize([light[0], light[1], light[2] + 1]);
    // A second, weaker light from the lower right: the room's own lamps catch the other side of the ball.
    const fill = normalize([0.6, 0.45, 0.65]);
    const fillHalfway = normalize([fill[0], fill[1], fill[2] + 1]);
    for (let frame = 0; frame < MIRROR_BALL_FRAMES; frame++) {
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const nx = (x + 0.5 - size / 2) / radius;
                const ny = (y + 0.5 - size / 2) / radius;
                const distance = Math.hypot(nx, ny);
                if (distance >= 1) {
                    continue;
                }
                const nz = Math.sqrt(1 - distance * distance);
                const longitude = Math.atan2(nx, nz) + Math.PI + frame * columnAngle;
                const latitude = Math.asin(-ny) + Math.PI / 2;
                const column = Math.floor(longitude / columnAngle);
                const row = Math.floor(latitude / rowAngle);
                const seam = Math.min(
                    longitude / columnAngle - column,
                    1 - (longitude / columnAngle - column),
                    latitude / rowAngle - row,
                    1 - (latitude / rowAngle - row),
                );
                // Each facet is a flat mirror: lit by the normal at its centre, not by the curve under the pixel.
                const facetLongitude = (column + 0.5) * columnAngle - Math.PI - frame * columnAngle;
                const facetLatitude = (row + 0.5) * rowAngle - Math.PI / 2;
                const facet = [
                    Math.sin(facetLongitude) * Math.cos(facetLatitude),
                    -Math.sin(facetLatitude),
                    Math.cos(facetLongitude) * Math.cos(facetLatitude),
                ];
                const noise = facetNoise(column % MIRROR_BALL_FRAMES, row);
                const diffuse = Math.max(0, dot(facet, light)) + 0.35 * Math.max(0, dot(facet, fill));
                const sparkle =
                    Math.pow(Math.max(0, dot(facet, halfway)), 40) * (0.7 + 0.3 * noise) +
                    0.7 * Math.pow(Math.max(0, dot(facet, fillHalfway)), 50) * noise;
                // Mirrors, not grey tiles: bright silver, each facet catching a little more or less light.
                const shade = (0.5 + 0.4 * noise) * (0.45 + 0.55 * Math.min(1, diffuse)) * (0.65 + 0.35 * nz);
                const seamDark = seam < 0.08 ? 0.45 : 1;
                const offset = (y * size * MIRROR_BALL_FRAMES + frame * size + x) * 4;
                // Silver with a cold tint, the sparkle going to pure white.
                image.data[offset] = clampByte((shade * 205 + sparkle * 255) * seamDark);
                image.data[offset + 1] = clampByte((shade * 212 + sparkle * 255) * seamDark);
                image.data[offset + 2] = clampByte((shade * 235 + sparkle * 255) * seamDark);
                // A touch of transparency in the facets (mirrors over glass), opaque where they flash.
                const opacity = Math.min(1, 0.82 + 0.18 * Math.min(1, sparkle * 2) + (seam < 0.08 ? 0.1 : 0));
                image.data[offset + 3] = clampByte(Math.min(1, (1 - distance) * radius) * opacity * 255);
            }
        }
        texture.add(frame, 0, frame * size, 0, size, size);
    }
    context.putImageData(image, 0, 0);
    texture.refresh();
}

function normalize(vector: number[]): number[] {
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length);
}

function dot(a: number[], b: number[]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function clampByte(value: number): number {
    return Math.round(Math.min(255, Math.max(0, value)));
}
