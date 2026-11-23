import { describe, expect, it } from "vitest";
import { SMOOTHED_CHANNELS, smoothWeights, texel } from "@wa/front/Phaser/Game/Terrain/GroundSplat";

/** The blur as it was first written: the nine cells around each one read again for each, from a copy of the weights. */
function smoothedOneCellAtATime(data: Uint8ClampedArray, columns: number, rows: number): void {
    const source = data.slice();
    SMOOTHED_CHANNELS.forEach((channels, pack) => {
        for (const channel of channels) {
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    let total = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        const y = Math.max(0, Math.min(rows - 1, row + dy));
                        for (let dx = -1; dx <= 1; dx++) {
                            const x = Math.max(0, Math.min(columns - 1, column + dx));
                            const weight = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
                            total += weight * (source[texel(pack, y * columns + x, columns, rows) + channel] ?? 0);
                        }
                    }
                    data[texel(pack, row * columns + column, columns, rows) + channel] = Math.round(total / 16);
                }
            }
        }
    });
}

/** The weights of a canvas, every byte drawn from a sequence that is the same at each run. */
function weightsOf(columns: number, rows: number, seed: number): Uint8ClampedArray {
    // Twelve packs, four across and three down, four bytes a cell.
    const data = new Uint8ClampedArray(columns * 4 * rows * 3 * 4);
    let state = seed;
    for (let index = 0; index < data.length; index++) {
        state = (state * 1103515245 + 12345) % 2147483648;
        // Mostly the bounds, as the weights mostly are (a soil is there or not), and some values between.
        const draw = state / 2147483648;
        data[index] = draw < 0.4 ? 0 : draw < 0.8 ? 255 : Math.floor(draw * 1000) % 256;
    }
    return data;
}

describe("smoothWeights", () => {
    it("rounds the weights over their neighbours exactly as reading the nine cells around each did", () => {
        for (const [columns, rows] of [
            [1, 1],
            [1, 7],
            [7, 1],
            [2, 2],
            [5, 4],
            [33, 17],
        ]) {
            const expected = weightsOf(columns, rows, columns * 100 + rows);
            const smoothed = expected.slice();
            smoothedOneCellAtATime(expected, columns, rows);
            smoothWeights(smoothed, columns, rows);
            expect(smoothed).toEqual(expected);
        }
    });

    it("leaves the bytes it does not smooth as they are: the water, the colours of the pools", () => {
        const columns = 6;
        const rows = 5;
        const data = weightsOf(columns, rows, 7);
        const before = data.slice();
        smoothWeights(data, columns, rows);
        for (let cell = 0; cell < columns * rows; cell++) {
            for (let pack = 0; pack < 12; pack++) {
                const smoothed = SMOOTHED_CHANNELS[pack] ?? [];
                for (let channel = 0; channel < 4; channel++) {
                    if (smoothed.includes(channel)) continue;
                    const at = texel(pack, cell, columns, rows) + channel;
                    expect(data[at]).toBe(before[at]);
                }
            }
        }
    });
});
