import type { CurrentVector, CurrentWater } from "./WaterCurrent";

/** The most flecks of foam on the screen at once. */
export const FOAM_MAX_FLECKS = 240;
/** How fast a fleck goes on the hardest current, in map pixels a second. */
export const FOAM_SPEED = 80;
/** Foam shows on water this deep at least: a shallow stream runs too, though it carries no one. */
export const FOAM_MIN_DEPTH_PX = 2;
/** Points of the screen tried at each step for a new fleck: the harder the current there, the likelier. */
const SPAWN_TRIES = 24;
/** The chance of a fleck at a point tried on the gentlest current: a slow water still shows that it moves. */
const GENTLE_CHANCE = 0.25;
/** A fleck lives this long, in ms: the shortest, and what chance adds to it. */
const LIFE_MS = 1200;
const LIFE_SPREAD_MS = 1600;
/** A fleck comes in and goes out over these many ms. */
const FADE_IN_MS = 200;
const FADE_OUT_MS = 300;
/** On water that stopped running a fleck ages this many times faster: it fades where it is. */
const STILL_AGEING = 6;
/** A fleck this far out of the screen is dropped, in map pixels. */
const VIEW_MARGIN = 32;
/** A step never counts for more than this, in ms: a tab that slept does not throw the foam across the map. */
const LONGEST_STEP_MS = 200;
/** The streak of a fleck: its length on still water and what the hardest current adds, in map pixels. */
const STREAK_PX = 3;
const STREAK_CURRENT_PX = 7;
const FOAM_ALPHA = 0.6;

/** A fleck of foam: where it is (map pixels), which way it goes (a vector of length 1) and how hard (0 to 1). */
export interface FoamFleck {
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    strength: number;
    age: number;
    life: number;
}

export interface FoamView {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The foam the running water of the relief carries: flecks born where there is a current, the more the harder it
 * is, carried along it and gone after a moment. It shows which way the water runs and how hard; still water shows
 * none. Each browser has its own flecks (a decor: nothing is shared), all read from the same current.
 */
export class WaterFoam {
    private readonly held: FoamFleck[] = [];

    constructor(
        private readonly currentAt: (x: number, y: number, now: number) => CurrentVector,
        private readonly random: () => number = Math.random,
    ) {}

    public flecks(): readonly FoamFleck[] {
        return this.held;
    }

    public clear(): void {
        this.held.length = 0;
    }

    /** Carries the flecks for `elapsed` ms and lets new ones be born over what the screen shows (map pixels). */
    public step(now: number, elapsed: number, view: FoamView): void {
        const ms = Math.max(0, Math.min(LONGEST_STEP_MS, elapsed));
        const held = this.held;
        let kept = 0;
        for (const fleck of held) {
            const current = this.currentAt(fleck.x, fleck.y, now);
            const strength = Math.hypot(current.x, current.y);
            if (strength > 0) {
                fleck.dirX = current.x / strength;
                fleck.dirY = current.y / strength;
                fleck.strength = strength;
                fleck.x += current.x * FOAM_SPEED * (ms / 1000);
                fleck.y += current.y * FOAM_SPEED * (ms / 1000);
                fleck.age += ms;
            } else {
                fleck.age += ms * STILL_AGEING;
            }
            const inside =
                fleck.x >= view.x - VIEW_MARGIN &&
                fleck.y >= view.y - VIEW_MARGIN &&
                fleck.x <= view.x + view.width + VIEW_MARGIN &&
                fleck.y <= view.y + view.height + VIEW_MARGIN;
            if (inside && fleck.age < fleck.life) held[kept++] = fleck;
        }
        held.length = kept;
        for (let attempt = 0; attempt < SPAWN_TRIES && held.length < FOAM_MAX_FLECKS; attempt++) {
            const x = view.x + this.random() * view.width;
            const y = view.y + this.random() * view.height;
            const chance = this.random();
            const current = this.currentAt(x, y, now);
            const strength = Math.hypot(current.x, current.y);
            if (strength <= 0 || chance >= GENTLE_CHANCE + (1 - GENTLE_CHANCE) * strength) continue;
            held.push({
                x,
                y,
                dirX: current.x / strength,
                dirY: current.y / strength,
                strength,
                age: 0,
                life: LIFE_MS + this.random() * LIFE_SPREAD_MS,
            });
        }
    }
}

/** A fleck as it is drawn: a streak from behind it to where it is, longer on a harder current. */
export function foamStreak(fleck: FoamFleck): {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    alpha: number;
} {
    const length = STREAK_PX + STREAK_CURRENT_PX * Math.min(1, fleck.strength);
    const shown = Math.max(0, Math.min(1, fleck.age / FADE_IN_MS, (fleck.life - fleck.age) / FADE_OUT_MS));
    return {
        fromX: fleck.x - fleck.dirX * length,
        fromY: fleck.y - fleck.dirY * length,
        toX: fleck.x,
        toY: fleck.y,
        alpha: FOAM_ALPHA * shown,
    };
}

/** The whirl over a sink turns between these many times a second, from a weak sink to the strongest. */
const WHIRL_SLOWEST = 0.2;
const WHIRL_FASTEST = 1.5;
/** The flows (litres a minute) of the slowest and of the fastest whirl: between them, by their powers of ten. */
const WHIRL_SLOW_FLOW = 600;
const WHIRL_FAST_FLOW = 60_000_000;
const WHIRL_ARMS = 3;
const WHIRL_DOTS_PER_ARM = 14;
/** How far round an arm winds from the rim to the middle, in turns. */
const WHIRL_WIND = 0.75;
/** An arm ends this near the middle, in a share of the radius. */
const WHIRL_EYE = 0.15;

/** How fast the whirl over a sink turns, in turns a second, from its flow (litres a minute). */
export function whirlTurnsPerSecond(litresPerMinute: number): number {
    if (Number.isNaN(litresPerMinute) || litresPerMinute <= WHIRL_SLOW_FLOW) return WHIRL_SLOWEST;
    const share = Math.min(
        1,
        Math.log10(litresPerMinute / WHIRL_SLOW_FLOW) / Math.log10(WHIRL_FAST_FLOW / WHIRL_SLOW_FLOW),
    );
    return WHIRL_SLOWEST + (WHIRL_FASTEST - WHIRL_SLOWEST) * share;
}

/**
 * The whirl over a sink at a time (seconds): dots along arms that wind from its rim to its middle, around the sink
 * (their places are from its middle, in map pixels). Fainter and smaller towards the middle, where the water goes.
 */
export function whirlDots(
    seconds: number,
    turnsPerSecond: number,
    radius: number,
): { x: number; y: number; alpha: number; size: number }[] {
    const dots: { x: number; y: number; alpha: number; size: number }[] = [];
    const turned = (seconds * turnsPerSecond) % 1;
    for (let arm = 0; arm < WHIRL_ARMS; arm++) {
        for (let dot = 0; dot < WHIRL_DOTS_PER_ARM; dot++) {
            const along = dot / (WHIRL_DOTS_PER_ARM - 1);
            const angle = 2 * Math.PI * (turned + arm / WHIRL_ARMS + along * WHIRL_WIND);
            const far = radius * (1 - along * (1 - WHIRL_EYE));
            dots.push({
                x: Math.cos(angle) * far,
                y: Math.sin(angle) * far,
                alpha: 0.7 - 0.4 * along,
                size: along < 0.5 ? 3 : 2,
            });
        }
    }
    return dots;
}

/** A ring of a source grows and fades over this long, in seconds. */
const RING_SECONDS = 1.4;
const RINGS = 2;

/** The rings over a source at a time (seconds): each grows from its foot to `radius` (map pixels) and fades. */
export function sourceRings(seconds: number, radius: number): { radius: number; alpha: number }[] {
    const rings: { radius: number; alpha: number }[] = [];
    for (let ring = 0; ring < RINGS; ring++) {
        const grown = (((seconds / RING_SECONDS + ring / RINGS) % 1) + 1) % 1;
        rings.push({ radius: Math.max(1, radius * grown), alpha: 0.55 * (1 - grown) });
    }
    return rings;
}

/** How many points around a sink are looked at for water. */
const AROUND_POINTS = 8;

/**
 * The water around a point of the map, `far` map pixels away: its mean depth in pixels. A strong sink keeps its own
 * disc dry: whether it has water to take shows around it.
 */
export function wetAround(
    water: Pick<CurrentWater, "depthAt">,
    x: number,
    y: number,
    far: number,
    now: number,
): number {
    let sum = 0;
    for (let point = 0; point < AROUND_POINTS; point++) {
        const angle = (2 * Math.PI * point) / AROUND_POINTS;
        sum += water.depthAt(x + Math.cos(angle) * far, y + Math.sin(angle) * far, now);
    }
    return sum / AROUND_POINTS;
}

/** The whole pixels of a line from one point to another, both ends included, each touching the one before (pixel art). */
export function pixelRun(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] {
    let x = Math.round(fromX);
    let y = Math.round(fromY);
    const endX = Math.round(toX);
    const endY = Math.round(toY);
    const dx = Math.abs(endX - x);
    const dy = -Math.abs(endY - y);
    const stepX = x < endX ? 1 : -1;
    const stepY = y < endY ? 1 : -1;
    let error = dx + dy;
    const pixels = [{ x, y }];
    while (x !== endX || y !== endY) {
        const twice = 2 * error;
        if (twice >= dy) {
            error += dy;
            x += stepX;
        }
        if (twice <= dx) {
            error += dx;
            y += stepY;
        }
        pixels.push({ x, y });
    }
    return pixels;
}

/** The pixels of a ring around a point (pixel art): 24 runs between points of the circle. */
export function ringPixels(centreX: number, centreY: number, radius: number): { x: number; y: number }[] {
    const pixels: { x: number; y: number }[] = [];
    const seen = new Set<string>();
    for (let side = 0; side < 24; side++) {
        const from = (side / 24) * 2 * Math.PI;
        const to = ((side + 1) / 24) * 2 * Math.PI;
        for (const pixel of pixelRun(
            centreX + Math.cos(from) * radius,
            centreY + Math.sin(from) * radius,
            centreX + Math.cos(to) * radius,
            centreY + Math.sin(to) * radius,
        )) {
            const key = `${pixel.x},${pixel.y}`;
            if (seen.has(key)) continue;
            seen.add(key);
            pixels.push(pixel);
        }
    }
    return pixels;
}
