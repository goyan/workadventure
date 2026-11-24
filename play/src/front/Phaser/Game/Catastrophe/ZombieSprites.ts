/**
 * The zombies of a horde, drawn here pixel by pixel, once (no image of anyone else): a hunched body, arms reaching
 * forward, torn and stained clothes, pale eyes, in a few looks, walking a shamble of four steps seen from the front,
 * the back and the side, standing dry, to the knee, to the waist or over the head in water. Pure: the pixels of the
 * sheet, as RGBA bytes, which ZombieView lays in a texture.
 */

/** A frame, in pixels: as tall as an avatar, its feet on its line ZOMBIE_FEET_Y. */
export const ZOMBIE_FRAME_WIDTH = 18;
export const ZOMBIE_FRAME_HEIGHT = 30;
export const ZOMBIE_FEET_Y = 27;
/** How many looks, ways (front, back, side), steps of the shamble and depths of water. */
export const ZOMBIE_LOOKS = 8;
export const ZOMBIE_WAYS = 3;
export const ZOMBIE_STEPS = 4;
export const ZOMBIE_WATERS = 4;
export const ZOMBIE_DOWN = 0;
export const ZOMBIE_UP = 1;
export const ZOMBIE_SIDE = 2;

/** The number of the frame of a look, a depth of water, a way and a step of the shamble. */
export function zombieFrame(look: number, water: number, way: number, step: number): number {
    return ((look * ZOMBIE_WATERS + water) * ZOMBIE_WAYS + way) * ZOMBIE_STEPS + step;
}

/** The frames of the sheet: a row per look, its frames side by side. */
export const ZOMBIE_SHEET_COLUMNS = ZOMBIE_WATERS * ZOMBIE_WAYS * ZOMBIE_STEPS;
export const ZOMBIE_SHEET_WIDTH = ZOMBIE_SHEET_COLUMNS * ZOMBIE_FRAME_WIDTH;
export const ZOMBIE_SHEET_HEIGHT = ZOMBIE_LOOKS * ZOMBIE_FRAME_HEIGHT;

/** Where a frame is on the sheet, in pixels. */
export function zombieFrameAt(frame: number): { x: number; y: number } {
    const column = frame % ZOMBIE_SHEET_COLUMNS;
    const row = Math.floor(frame / ZOMBIE_SHEET_COLUMNS);
    return { x: column * ZOMBIE_FRAME_WIDTH, y: row * ZOMBIE_FRAME_HEIGHT };
}

type Rgba = readonly [number, number, number, number];

function rgb(hex: string, alpha = 255): Rgba {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

/** A colour in the shade: the leg behind. */
function darker(color: Rgba): Rgba {
    return [Math.round(color[0] * 0.8), Math.round(color[1] * 0.8), Math.round(color[2] * 0.8), color[3]];
}

interface Look {
    skin: string;
    skinShade: string;
    hair: string | undefined;
    shirt: string;
    shirtShade: string;
    pants: string;
    /** Its head leans that way (-1 left, 1 right). */
    tilt: number;
}

/** Sick skins, grey-green to sallow; old clothes, faded. */
const LOOKS: readonly Look[] = [
    {
        skin: "#7f9c6c",
        skinShade: "#617d52",
        hair: "#2b231c",
        shirt: "#5b4636",
        shirtShade: "#433326",
        pants: "#2f2b28",
        tilt: 1,
    },
    {
        skin: "#9aa88c",
        skinShade: "#7b8a6e",
        hair: "#4a3a28",
        shirt: "#3d4b60",
        shirtShade: "#2c3747",
        pants: "#383d48",
        tilt: -1,
    },
    {
        skin: "#b3b98f",
        skinShade: "#929a70",
        hair: undefined,
        shirt: "#6e3b3b",
        shirtShade: "#522b2b",
        pants: "#4b3b2b",
        tilt: 1,
    },
    {
        skin: "#71907f",
        skinShade: "#557262",
        hair: "#1e1e22",
        shirt: "#4c5a3a",
        shirtShade: "#38432a",
        pants: "#2e2a26",
        tilt: -1,
    },
    {
        skin: "#8ea275",
        skinShade: "#70855a",
        hair: "#5b4a35",
        shirt: "#8a8270",
        shirtShade: "#6b6455",
        pants: "#3a3f4a",
        tilt: 1,
    },
    {
        skin: "#a0a07c",
        skinShade: "#82825f",
        hair: undefined,
        shirt: "#2f3038",
        shirtShade: "#212229",
        pants: "#4a4236",
        tilt: -1,
    },
    {
        skin: "#7a8f6a",
        skinShade: "#5e7250",
        hair: "#3a2a1a",
        shirt: "#5a6f7f",
        shirtShade: "#435461",
        pants: "#2b2b30",
        tilt: 1,
    },
    {
        skin: "#9cb08a",
        skinShade: "#7d916c",
        hair: "#222222",
        shirt: "#6b5a3a",
        shirtShade: "#4f422a",
        pants: "#333333",
        tilt: -1,
    },
];
const OUTLINE = rgb("#1b1712");
const SHOE = rgb("#241f1b");
const EYE = rgb("#eee68a");
const MOUTH = rgb("#2e1414");
const BLOOD = rgb("#6d1414");
const SHADOW = rgb("#000000", 72);
const RIPPLE = rgb("#e1eef6", 200);
const RIPPLE_EDGE = rgb("#b7d2e4", 150);

/** Where the water comes to on a zombie (the first row hidden), dry to over its head. */
const WATER_LINE = [ZOMBIE_FRAME_HEIGHT, 22, 15, 4];

/** A small luck of its own, the same at each drawing: where the stains and the tears go. */
function luck(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state ^ (state >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
        return state / 4294967296;
    };
}

/** One frame: its pixels drawn into the sheet at (left, top). */
function drawFrame(
    sheet: Uint8ClampedArray,
    left: number,
    top: number,
    lookIndex: number,
    water: number,
    way: number,
    step: number,
): void {
    const look = LOOKS[lookIndex];
    const W = ZOMBIE_FRAME_WIDTH;
    const H = ZOMBIE_FRAME_HEIGHT;
    // The body first, in a frame of its own: 0 is nothing.
    const body: (Rgba | undefined)[] = new Array<Rgba | undefined>(W * H).fill(undefined);
    const put = (x: number, y: number, color: Rgba): void => {
        if (x >= 0 && y >= 0 && x < W && y < H) body[y * W + x] = color;
    };
    const clear = (x: number, y: number): void => {
        if (x >= 0 && y >= 0 && x < W && y < H) body[y * W + x] = undefined;
    };
    const rect = (x0: number, y0: number, x1: number, y1: number, color: Rgba): void => {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, color);
    };
    const skin = rgb(look.skin);
    const skinShade = rgb(look.skinShade);
    const shirt = rgb(look.shirt);
    const shirtShade = rgb(look.shirtShade);
    const pants = rgb(look.pants);
    const hair = look.hair ? rgb(look.hair) : undefined;
    // Up on the passing steps: it bobs as it shambles.
    const bob = step % 2 === 1 ? -1 : 0;
    const feet = ZOMBIE_FEET_Y - 1;
    const random = luck(lookIndex * 97 + way * 13 + 5);

    if (way === ZOMBIE_SIDE) {
        // Facing right. The legs swing: one forward, the other back, then the other way.
        const swing = [3, 0, -3, 0][step];
        const leg = (hipX: number, footX: number, color: Rgba): void => {
            for (let y = 17 + bob; y <= feet; y++) {
                const t = (y - 17 - bob) / (feet - 17 - bob);
                const x = Math.round(hipX + (footX - hipX) * t);
                put(x, y, color);
                put(x + 1, y, color);
            }
            rect(footX, feet + 1, footX + 2, feet + 1, SHOE);
        };
        leg(7, 7 - swing, darker(pants));
        // The arm behind, reaching forward, darker.
        rect(9, 13 + bob, 11, 13 + bob, shirtShade);
        rect(12, 13 + bob, 15, 13 + bob, skinShade);
        // The body, hunched: its shoulders forward.
        rect(5, 11 + bob, 10, 17 + bob, shirt);
        rect(6, 10 + bob, 11, 10 + bob, shirt);
        rect(5, 14 + bob, 5, 17 + bob, shirtShade);
        leg(8, 8 + swing, pants);
        // The head, forward of the body.
        rect(8, 3 + bob, 13, 9 + bob, skin);
        rect(9, 10 + bob, 11, 10 + bob, skinShade);
        clear(8, 3 + bob);
        clear(13, 3 + bob);
        if (hair) {
            rect(8, 3 + bob, 13, 4 + bob, hair);
            rect(8, 5 + bob, 9, 7 + bob, hair);
        }
        put(12, 6 + bob, EYE);
        rect(12, 8 + bob, 13, 8 + bob, MOUTH);
        put(12, 9 + bob, BLOOD);
        // The arm in front, reaching forward.
        rect(9, 11 + bob, 12, 12 + bob, shirt);
        rect(13, 11 + bob, 16, 12 + bob, skin);
        put(16, 13 + bob, skin);
    } else {
        // Seen from the front or the back: the legs step in turn, the lifted one a pixel short.
        const leftUp = step === 0 ? 0 : step === 2 ? 1 : 0;
        const rightUp = step === 2 ? 0 : step === 0 ? 1 : 0;
        rect(6, 17 + bob, 7, feet - leftUp, pants);
        rect(10, 17 + bob, 11, feet - rightUp, pants);
        rect(5, feet + 1 - leftUp, 7, feet + 1 - leftUp, SHOE);
        rect(10, feet + 1 - rightUp, 12, feet + 1 - rightUp, SHOE);
        // The body, its sides in shade.
        rect(5, 10 + bob, 12, 17 + bob, shirt);
        rect(5, 10 + bob, 5, 17 + bob, shirtShade);
        rect(12, 10 + bob, 12, 17 + bob, shirtShade);
        // The shoulders and the sleeves.
        rect(4, 10 + bob, 4, 12 + bob, shirtShade);
        rect(13, 10 + bob, 13, 12 + bob, shirtShade);
        // The head, leaning its way, its corners rounded.
        const tilt = look.tilt * (step === 1 || step === 3 ? 1 : 0);
        rect(5 + tilt, 2 + bob, 12 + tilt, 9 + bob, skin);
        clear(5 + tilt, 2 + bob);
        clear(12 + tilt, 2 + bob);
        rect(7, 9 + bob, 10, 9 + bob, skinShade);
        if (way === ZOMBIE_DOWN) {
            if (hair) {
                rect(5 + tilt, 2 + bob, 12 + tilt, 3 + bob, hair);
                put(5 + tilt, 4 + bob, hair);
                put(12 + tilt, 4 + bob, hair);
            }
            put(7 + tilt, 5 + bob, EYE);
            put(10 + tilt, 5 + bob, EYE);
            rect(8 + tilt, 7 + bob, 9 + tilt, 7 + bob, MOUTH);
            put(9 + tilt, 8 + bob, BLOOD);
            // The hands reaching out at the one who looks, one higher than the other in turn.
            const leftHand = step === 1 ? -1 : 0;
            const rightHand = step === 3 ? -1 : 0;
            rect(3, 12 + bob + leftHand, 5, 13 + bob + leftHand, skin);
            rect(12, 12 + bob + rightHand, 14, 13 + bob + rightHand, skin);
            put(3, 14 + bob + leftHand, skinShade);
            put(14, 14 + bob + rightHand, skinShade);
        } else {
            // From the back: its hair (or its bald head), the nape, no hands.
            rect(5 + tilt, 2 + bob, 12 + tilt, 7 + bob, hair ?? skinShade);
            clear(5 + tilt, 2 + bob);
            clear(12 + tilt, 2 + bob);
        }
    }
    // Stains and tears: a few dark spots on the shirt, a ragged hem.
    for (let spot = 0; spot < 4; spot++) {
        const x = 5 + Math.floor(random() * 7);
        const y = 11 + Math.floor(random() * 6) + bob;
        const at = body[y * W + x];
        if (at === shirt || at === shirtShade) put(x, y, BLOOD);
    }
    for (let x = 5; x <= 12; x++) {
        if (random() < 0.4) {
            const y = 17 + bob;
            if (body[y * W + x] === shirt || body[y * W + x] === shirtShade) put(x, y, skinShade);
        }
    }

    // The outline: every empty pixel next to the body.
    const outlined: (Rgba | undefined)[] = body.slice();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (body[y * W + x]) continue;
            const next =
                (x > 0 && body[y * W + x - 1]) ||
                (x < W - 1 && body[y * W + x + 1]) ||
                (y > 0 && body[(y - 1) * W + x]) ||
                (y < H - 1 && body[(y + 1) * W + x]);
            if (next) outlined[y * W + x] = OUTLINE;
        }
    }
    // The water hides what is under its line, and rings round the body there; dry, a shadow at its feet.
    const line = WATER_LINE[water];
    if (water > 0) {
        for (let y = line; y < H; y++) for (let x = 0; x < W; x++) outlined[y * W + x] = undefined;
        let first = W;
        let last = -1;
        for (let x = 0; x < W; x++) {
            if (outlined[(line - 1) * W + x]) {
                first = Math.min(first, x);
                last = Math.max(last, x);
            }
        }
        if (last < 0) {
            first = 6;
            last = 11;
        }
        for (let x = first - 1; x <= last + 1; x++) {
            if (x >= 0 && x < W) outlined[line * W + x] = RIPPLE;
        }
        if (first - 2 >= 0) outlined[(line - 1) * W + first - 2] = RIPPLE_EDGE;
        if (last + 2 < W) outlined[(line - 1) * W + last + 2] = RIPPLE_EDGE;
        if (line + 1 < H) {
            for (let x = first - 2; x <= last + 2; x++) {
                if (x >= 0 && x < W && (x === first - 2 || x === last + 2)) outlined[(line + 1) * W + x] = RIPPLE_EDGE;
            }
        }
    } else {
        for (let y = ZOMBIE_FEET_Y; y <= ZOMBIE_FEET_Y + 1; y++) {
            for (let x = 3; x <= 14; x++) {
                const dx = (x - 8.5) / 6;
                const dy = (y - ZOMBIE_FEET_Y - 0.5) / 1.5;
                if (dx * dx + dy * dy <= 1 && !outlined[y * W + x]) outlined[y * W + x] = SHADOW;
            }
        }
    }
    const stride = ZOMBIE_SHEET_WIDTH * 4;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const color = outlined[y * W + x];
            if (!color) continue;
            const at = (top + y) * stride + (left + x) * 4;
            sheet[at] = color[0];
            sheet[at + 1] = color[1];
            sheet[at + 2] = color[2];
            sheet[at + 3] = color[3];
        }
    }
}

/** The whole sheet of the zombies, RGBA, ZOMBIE_SHEET_WIDTH x ZOMBIE_SHEET_HEIGHT. */
export function drawZombieSheet(): Uint8ClampedArray {
    const sheet = new Uint8ClampedArray(ZOMBIE_SHEET_WIDTH * ZOMBIE_SHEET_HEIGHT * 4);
    for (let look = 0; look < ZOMBIE_LOOKS; look++) {
        for (let water = 0; water < ZOMBIE_WATERS; water++) {
            for (let way = 0; way < ZOMBIE_WAYS; way++) {
                for (let step = 0; step < ZOMBIE_STEPS; step++) {
                    const { x, y } = zombieFrameAt(zombieFrame(look, water, way, step));
                    drawFrame(sheet, x, y, look, water, way, step);
                }
            }
        }
    }
    return sheet;
}
