<script lang="ts">
    // The pixel office skyline of the WorkAdventure desktop client (src/renderer/skyline.ts there): the same city
    // every time, its lit windows switching on one after another. Two skies, like there: the moon and twinkling stars
    // by night, the sun and drifting clouds by day (the light palette). Decorative only.
    const WIDTH = 240;
    const HEIGHT = 44;
    const GROUND = 4;
    const WINDOW_STEP = 3;
    const LIGHT_STAGGER_S = 0.035;

    /** [x, width, height] in pixels; the far row sits behind the near one. */
    const FAR_ROW: [number, number, number][] = [
        [4, 18, 30],
        [26, 14, 22],
        [44, 22, 36],
        [70, 16, 26],
        [92, 26, 38],
        [124, 14, 24],
        [142, 20, 34],
        [166, 16, 28],
        [186, 24, 37],
        [214, 22, 27],
    ];
    const NEAR_ROW: [number, number, number][] = [
        [0, 20, 18],
        [16, 16, 24],
        [36, 26, 16],
        [60, 14, 27],
        [78, 30, 20],
        [112, 18, 29],
        [134, 26, 17],
        [164, 14, 25],
        [182, 22, 19],
        [206, 16, 26],
        [224, 16, 15],
    ];

    /** The pixel sun and moon, row by row: [offset from its left side, width]. A disc 10 pixels wide. */
    const DISC_ROWS: [number, number][] = [
        [3, 4],
        [1, 8],
        [1, 8],
        [0, 10],
        [0, 10],
        [0, 10],
        [0, 10],
        [1, 8],
        [1, 8],
        [3, 4],
    ];
    /** Above the lowest roofs (x 26 to 44): the sun and the moon rise clear of them. */
    const DISC_X = 30;
    const DISC_Y = 5;
    const MOON_CRATERS: [number, number, number][] = [
        [2, 2, 2],
        [6, 4, 1],
        [3, 6, 2],
        [6, 7, 1],
    ];
    const CLOUD_WIDTH = 16;
    /** [x, y, speed in pixels per second]: each cloud crosses the sky, then comes back from the west. */
    const CLOUDS: [number, number, number][] = [
        [62, 7, 1.6],
        [104, 3, 1.1],
        [196, 9, 1.35],
    ];
    const STARS = 16;
    const STAR_SKY_HEIGHT = 16;
    const TWINKLE_EVERY = 3;

    const disc = DISC_ROWS.map(([offset, width], row) => ({ x: DISC_X + offset, y: DISC_Y + row, width }));
    const craters = MOON_CRATERS.map(([x, y, width]) => ({ x: DISC_X + x, y: DISC_Y + y, width }));
    const clouds = CLOUDS.map(([x, y, speed]) => {
        const travel = WIDTH + CLOUD_WIDTH;
        const duration = travel / speed;
        return {
            y,
            travel: `${travel}px`,
            duration: `${duration.toFixed(1)}s`,
            // Starts where it is placed: shifted by the time it would have taken to get there.
            delay: `${(-((x + CLOUD_WIDTH) / travel) * duration).toFixed(1)}s`,
        };
    });
    const stars = buildStars();

    function buildStars(): { x: number; y: number; twinkle: boolean; delay: string }[] {
        const random = seededRandom(31);
        return Array.from({ length: STARS }, (_, index) => ({
            x: Math.floor(random() * WIDTH),
            y: 1 + Math.floor(random() * STAR_SKY_HEIGHT),
            twinkle: index % TWINKLE_EVERY === 0,
            delay: `${(random() * 4).toFixed(2)}s`,
        }));
    }

    interface Shape {
        x: number;
        y: number;
        width: number;
        height: number;
        kind: "far" | "near" | "window" | "lit";
        delay?: string;
    }

    const shapes = buildSkyline();

    function buildSkyline(): Shape[] {
        const random = seededRandom(7);
        let litCount = 0;
        const result: Shape[] = [];
        for (const [kind, buildings] of [
            ["far", FAR_ROW],
            ["near", NEAR_ROW],
        ] as const) {
            for (const [x, width, height] of buildings) {
                const top = HEIGHT - GROUND - height;
                result.push({ x, y: top, width, height, kind });
                for (let wy = top + 3; wy < HEIGHT - GROUND - 3; wy += WINDOW_STEP) {
                    for (let wx = x + 2; wx < x + width - 2; wx += WINDOW_STEP) {
                        const lit = random() < (kind === "near" ? 0.32 : 0.18);
                        result.push({
                            x: wx,
                            y: wy,
                            width: 1,
                            height: 1,
                            kind: lit ? "lit" : "window",
                            delay: lit ? `${(litCount++ * LIGHT_STAGGER_S).toFixed(3)}s` : undefined,
                        });
                    }
                }
            }
        }
        return result;
    }

    /** Small deterministic generator (mulberry32): the same windows are lit every time. */
    function seededRandom(seed: number): () => number {
        let state = seed;
        return () => {
            state = (state + 0x6d2b79f5) | 0;
            let value = Math.imul(state ^ (state >>> 15), 1 | state);
            value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
            return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
        };
    }
</script>

<svg
    class="skyline"
    viewBox="0 0 {WIDTH} {HEIGHT}"
    preserveAspectRatio="xMidYMax slice"
    aria-hidden="true"
    focusable="false"
>
    <defs>
        <linearGradient id="pixel-skyline-day-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="hsl(203 82% 86%)" stop-opacity="0" />
            <stop offset="1" stop-color="hsl(203 82% 86%)" />
        </linearGradient>
    </defs>
    <rect class="day-sky" x="0" y="0" width={WIDTH} height={HEIGHT} fill="url(#pixel-skyline-day-sky)" />
    {#each stars as star, index (index)}
        <rect
            x={star.x}
            y={star.y}
            width="1"
            height="1"
            class="star"
            class:twinkle={star.twinkle}
            style:--delay={star.delay}
        />
    {/each}
    <g class="moon">
        {#each disc as row, index (index)}
            <rect x={row.x} y={row.y} width={row.width} height="1" />
        {/each}
        {#each craters as crater, index (index)}
            <rect x={crater.x} y={crater.y} width={crater.width} height="1" class="crater" />
        {/each}
    </g>
    <g class="sun">
        {#each disc as row, index (index)}
            <rect x={row.x} y={row.y} width={row.width} height="1" />
        {/each}
    </g>
    {#each clouds as cloud, index (index)}
        <g class="cloud" style:--travel={cloud.travel} style:--duration={cloud.duration} style:--delay={cloud.delay}>
            <rect x={-CLOUD_WIDTH} y={cloud.y + 2} width={CLOUD_WIDTH} height="3" />
            <rect x={-CLOUD_WIDTH + 3} y={cloud.y} width="7" height="3" />
            <rect x={-CLOUD_WIDTH + 9} y={cloud.y + 1} width="5" height="2" />
        </g>
    {/each}
    {#each shapes as shape, index (index)}
        <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            class={shape.kind}
            style:--delay={shape.delay}
        />
    {/each}
    <rect x="0" y={HEIGHT - GROUND} width={WIDTH} height={GROUND} class="ground" />
</svg>

<style>
    /* Night by default; the light palette of the interface turns it into day (style/retro-theme.css). */
    .skyline {
        --city-far: #19213a;
        --city-near: #212a45;
        --city-window: #2a3455;
        --city-window-lit: var(--rt-highlight, #ffd36b);
        --city-ground: var(--rt-bg-deep, #0e1320);
        --moon: #f3f0dc;
        display: block;
        width: 100%;
        height: auto;
        shape-rendering: crispEdges;
        pointer-events: none;
    }

    :global(:root[data-retro-palette="light"]) .skyline {
        --city-far: hsl(212 32% 80%);
        --city-near: hsl(216 26% 66%);
        --city-window: hsl(199 64% 88%);
        --city-window-lit: hsl(195 100% 97%);
        --city-ground: hsl(216 22% 58%);
    }

    .far {
        fill: var(--city-far);
    }

    .near {
        fill: var(--city-near);
    }

    .window {
        fill: var(--city-window);
    }

    .lit {
        fill: var(--city-window-lit);
        animation: light-on 0.5s steps(2) both;
        animation-delay: var(--delay, 0s);
    }

    .ground {
        fill: var(--city-ground);
    }

    /* Round glows: the filter follows the pixel disc, not its bounding box. */
    .moon {
        fill: var(--moon);
        filter: drop-shadow(0 0 1.5px rgb(243 240 220 / 55%));
    }

    .crater {
        fill: #d6d1b4;
    }

    .star {
        fill: var(--moon);
        opacity: 0.55;
    }

    .star.twinkle {
        animation: twinkle 3.2s steps(2) infinite;
        animation-delay: var(--delay, 0s);
    }

    .sun {
        display: none;
        fill: hsl(42 100% 64%);
        filter: drop-shadow(0 0 2.5px rgb(255 196 64 / 75%));
    }

    .day-sky {
        display: none;
    }

    .cloud {
        display: none;
        fill: #fff;
        animation: drift var(--duration, 300s) linear infinite;
        animation-delay: var(--delay, 0s);
    }

    :global(:root[data-retro-palette="light"]) .day-sky,
    :global(:root[data-retro-palette="light"]) .sun,
    :global(:root[data-retro-palette="light"]) .cloud {
        display: inline;
    }

    :global(:root[data-retro-palette="light"]) .moon,
    :global(:root[data-retro-palette="light"]) .star {
        display: none;
    }

    @keyframes light-on {
        from {
            fill: var(--city-window);
        }
    }

    @keyframes twinkle {
        50% {
            opacity: 0.15;
        }
    }

    @keyframes drift {
        from {
            transform: translateX(0);
        }
        to {
            transform: translateX(var(--travel, 0));
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .lit,
        .star.twinkle,
        .cloud {
            animation: none;
        }
    }
</style>
