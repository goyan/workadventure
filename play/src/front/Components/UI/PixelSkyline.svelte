<script lang="ts">
    // The pixel office skyline of the WorkAdventure desktop client (src/renderer/skyline.ts there): the same city
    // every time, its lit windows switching on one after another. Decorative only.
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
    .skyline {
        display: block;
        width: 100%;
        height: auto;
        shape-rendering: crispEdges;
        pointer-events: none;
    }

    .far {
        fill: #19213a;
    }

    .near {
        fill: #212a45;
    }

    .window {
        fill: #2a3455;
    }

    .lit {
        fill: var(--rt-highlight, #ffd36b);
        animation: light-on 0.5s steps(2) both;
        animation-delay: var(--delay, 0s);
    }

    .ground {
        fill: var(--rt-bg-deep, #0e1320);
    }

    @keyframes light-on {
        from {
            fill: #2a3455;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .lit {
            animation: none;
        }
    }
</style>
