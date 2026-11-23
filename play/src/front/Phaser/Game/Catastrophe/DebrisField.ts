/**
 * The debris a very strong wind tears off and carries (leaves, twigs, chips), as this browser draws them: a few dark
 * bits that go with the wind where they are, round the eye of a hurricane, densest and fastest at its eyewall, none in
 * its eye. Drawn only, nothing told: each browser has its own. A pure field of bits, drawn by HurricaneDebris.
 */

/** No debris under these gusts (km/h): force 12 of Beaufort, where loose things and branches fly. */
export const DEBRIS_MIN_GUST_KMH = 120;
/** The gusts at which a bit is torn off wherever one may be: those of a category 4 at its eyewall. */
const DEBRIS_FULL_GUST_KMH = 250;
/** The most bits in the air at once: what keeps the cost bounded. */
export const DEBRIS_MAX = 150;
/**
 * How fast a bit goes for a wind of 1 km/h, map pixels a second: the storm is reduced to the size of the map, and
 * its debris with it (a real one, at 250 km/h, would cross the view in a fraction of a second): a bit goes about 300 px
 * a second in the strongest wind, its way round the eye seen.
 */
export const DEBRIS_PX_PER_KMH = 1.2;
/** How long a bit flies, seconds, at least and at most; it fades in and out over FADE_SECONDS. */
const LIFE_SECONDS: readonly [number, number] = [1.5, 4];
const FADE_SECONDS = 0.3;
/** Bits are born this far around the view too: they come in from its edges. */
const MARGIN_PX = 64;

/** The wind at a point, as the debris read it; undefined where none blows that matters (outside the storm). */
export interface DebrisWind {
    /** Its speed (km/h, averaged) and its gusts (km/h), and where it comes from (degrees, 0 north, 90 east). */
    speed: number;
    gust: number;
    from: number;
    /** In the eye of a hurricane: calm, no bit there. */
    calm?: boolean;
}

export interface DebrisBit {
    x: number;
    y: number;
    /** Its angle and how fast it turns on itself (radians, radians a second). */
    angle: number;
    spin: number;
    /** Which bit it is (a leaf, a twig, a chip). */
    kind: number;
    age: number;
    life: number;
    /** How much of it is seen, 0 to 1 (it fades in and out). */
    alpha: number;
}

export interface DebrisView {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** How likely a bit is torn off in gusts of `gust` km/h, 0 under DEBRIS_MIN_GUST_KMH to 1 at DEBRIS_FULL_GUST_KMH. */
export function debrisShare(gust: number): number {
    if (!Number.isFinite(gust) || gust <= DEBRIS_MIN_GUST_KMH) return 0;
    return Math.min(1, (gust - DEBRIS_MIN_GUST_KMH) / (DEBRIS_FULL_GUST_KMH - DEBRIS_MIN_GUST_KMH));
}

/** The way and the speed of a bit in a wind (map pixels a second): with the wind, a wind from the north goes south. */
export function debrisVelocity(speed: number, from: number): { vx: number; vy: number } {
    const to = (((Number.isFinite(from) ? from : 0) + 180) * Math.PI) / 180;
    const pace = Math.max(0, Number.isFinite(speed) ? speed : 0) * DEBRIS_PX_PER_KMH;
    return { vx: pace * Math.sin(to), vy: -pace * Math.cos(to) };
}

export class DebrisField {
    public readonly bits: DebrisBit[] = [];

    constructor(
        private readonly random: () => number = Math.random,
        private readonly kinds = 3,
    ) {}

    /**
     * Moves the bits `seconds` on with the wind where each is, lets go of those that landed, fell calm or left the
     * view, and tears new ones off in the view where the gusts are strong enough.
     */
    public step(seconds: number, view: DebrisView, windAt: (x: number, y: number) => DebrisWind | undefined): void {
        const dt = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 0.1) : 0;
        if (dt === 0) return;
        const left = view.x - 2 * MARGIN_PX;
        const top = view.y - 2 * MARGIN_PX;
        const right = view.x + view.width + 2 * MARGIN_PX;
        const bottom = view.y + view.height + 2 * MARGIN_PX;
        let kept = 0;
        for (const bit of this.bits) {
            const wind = windAt(bit.x, bit.y);
            bit.age += dt;
            const gone =
                !wind ||
                wind.calm === true ||
                debrisShare(wind.gust) <= 0 ||
                bit.age >= bit.life ||
                bit.x < left ||
                bit.x > right ||
                bit.y < top ||
                bit.y > bottom;
            if (gone) continue;
            const { vx, vy } = debrisVelocity(wind.speed, wind.from);
            bit.x += vx * dt;
            bit.y += vy * dt;
            bit.angle += bit.spin * dt;
            bit.alpha = Math.min(1, bit.age / FADE_SECONDS, (bit.life - bit.age) / FADE_SECONDS);
            this.bits[kept++] = bit;
        }
        this.bits.length = kept;
        // As many tries as bits that would be born in the strongest wind over this time: the field fills as the gusts
        // allow, the most where they are the strongest.
        const tries = Math.ceil((DEBRIS_MAX * dt) / ((LIFE_SECONDS[0] + LIFE_SECONDS[1]) / 2));
        for (let attempt = 0; attempt < tries && this.bits.length < DEBRIS_MAX; attempt++) {
            const x = view.x - MARGIN_PX + this.random() * (view.width + 2 * MARGIN_PX);
            const y = view.y - MARGIN_PX + this.random() * (view.height + 2 * MARGIN_PX);
            const wind = windAt(x, y);
            if (!wind || wind.calm === true || this.random() >= debrisShare(wind.gust)) continue;
            this.bits.push({
                x,
                y,
                angle: this.random() * 2 * Math.PI,
                spin: (this.random() < 0.5 ? -1 : 1) * (2 + 6 * this.random()),
                kind: Math.floor(this.random() * this.kinds),
                age: 0,
                life: LIFE_SECONDS[0] + (LIFE_SECONDS[1] - LIFE_SECONDS[0]) * this.random(),
                alpha: 0,
            });
        }
    }

    public clear(): void {
        this.bits.length = 0;
    }
}
