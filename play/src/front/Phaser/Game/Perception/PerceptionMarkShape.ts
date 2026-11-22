import { NERF_HEART_HEIGHT } from "../Nerf/NerfHeartShape";
import type { PerceptionMark } from "./PerceptionProtocol";

/**
 * The two symbols of a perception changed by a spell, drawn in pixels like the icons of the wheel: one letter per
 * pixel (its color below), "." for transparent, "s" for the sparkles of the spell, which twinkle.
 * Basique: an eye crossed out (the world is not seen any more). Another place: an open eye inside a crystal ball
 * (another sky is seen). Fast water: a drop of water (the water runs faster for them). All carry the same star, the
 * sign of the spell; their outlines differ (a flat eye and its stroke, a ring, a drop), so that they are told apart
 * without their colors.
 */
const MARK_GRIDS: Record<PerceptionMark, readonly string[]> = {
    basic: [
        "v.........s.",
        ".v.......sss",
        "..v.kkkk..s.",
        "..kkwwwwkk..",
        ".kwwkvvvwwk.",
        "kwwvvkvvvwwk",
        ".kwwvvkvvwk.",
        "..kkwwwkkk..",
        "....kkkkk...",
        ".........v..",
        "..........v.",
        "...........v",
    ],
    place: [
        "..........s.",
        ".........sss",
        "...kkkk...s.",
        ".kkcwcckk...",
        ".kcwcccck...",
        "kcckkkkcck..",
        "kckwnnwkck..",
        "kckwnnwkck..",
        "kcckkkkcck..",
        ".kcccccck...",
        ".kkcccckk...",
        "...kkkk.....",
    ],
    water: [
        "..........s.",
        ".....k...sss",
        "....kbk...s.",
        "....kbk.....",
        "...kbbbk....",
        "...kbwbk....",
        "..kbwbbbk...",
        "..kbwbbbk...",
        "..kbbbbbk...",
        "...kbbbk....",
        "....kkk.....",
        "............",
    ],
};

export const PERCEPTION_MARK_COLORS = {
    k: "#1b1b2a", // outline
    v: "#b48cff", // the iris and the stroke, violet
    c: "#9fe3f5", // the glass of the ball, light cyan
    w: "#f4f4f4", // white of the eye, glint
    n: "#2b3a67", // pupil
    b: "#3d8bfd", // the drop of water, blue
    s: "#ffd36b", // sparkle
} as const;

/** The glow around each symbol (a CSS drop shadow): a violet spell, a cyan one, a blue one. */
export const PERCEPTION_MARK_AURA: Record<PerceptionMark, string> = {
    basic: "#b48cff",
    place: "#7fd6f0",
    water: "#5aa9ff",
};

export interface MarkPixel {
    readonly x: number;
    readonly y: number;
    readonly color: string;
    /** A pixel of the sparkle, which twinkles. */
    readonly sparkle: boolean;
}

/** The size of a symbol, in pixels of the game (one pixel of the drawing each). */
export function perceptionMarkSize(mark: PerceptionMark): { width: number; height: number } {
    const grid = MARK_GRIDS[mark];
    return { width: Math.max(...grid.map((row) => row.length)), height: grid.length };
}

/** The pixels of a symbol. */
export function perceptionMarkPixels(mark: PerceptionMark): MarkPixel[] {
    const pixels: MarkPixel[] = [];
    MARK_GRIDS[mark].forEach((row, y) => {
        [...row].forEach((letter, x) => {
            if (!isMarkColor(letter)) return;
            pixels.push({ x, y, color: PERCEPTION_MARK_COLORS[letter], sparkle: letter === "s" });
        });
    });
    return pixels;
}

function isMarkColor(letter: string): letter is keyof typeof PERCEPTION_MARK_COLORS {
    return letter in PERCEPTION_MARK_COLORS;
}

/** Between the top of the name tag and the symbol, in pixels of the game. */
const GAP_ABOVE_NAME = 2;

/**
 * How high above the top of the name tag the symbol floats, in pixels of the game: over the row of the Nerf hearts
 * when they show (they sit right on the name tag, see NerfHeartsEffect). The name tag itself already follows the
 * avatar, its floor and the plane (see Character.updateUsernameDisplayPosition): the symbol rides on it.
 */
export function perceptionMarkLift(heartsShown: boolean): number {
    return GAP_ABOVE_NAME + (heartsShown ? NERF_HEART_HEIGHT + 1 : 0);
}

/**
 * The symbol floats up and down this far, in pixels of the game, once every FLOAT_PERIOD_MS: by whole pixels, in two
 * positions (a drawing in pixels moved by less would blur), so it moves twice per period.
 */
export const PERCEPTION_MARK_FLOAT_PX = 1;
export const PERCEPTION_MARK_FLOAT_PERIOD_MS = 2400;
/** The sparkles twinkle in a few steps per period: played by the browser, the scene is not drawn again for them. */
export const PERCEPTION_MARK_TWINKLE_PERIOD_MS = 1600;
