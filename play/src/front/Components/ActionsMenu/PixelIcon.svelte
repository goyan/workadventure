<script lang="ts">
    import { PIXEL_ICON_COLORS, PIXEL_ICONS, type PixelIconName } from "./PixelIcons";

    let { name, size = 32 }: { name: PixelIconName; size?: number } = $props();

    // One rectangle per run of same-colored pixels on a row: crisp at any size.
    const runs = $derived(
        PIXEL_ICONS[name].flatMap((row, y) => {
            const result: { x: number; y: number; width: number; color: string }[] = [];
            let start = 0;
            for (let x = 1; x <= row.length; x++) {
                if (x < row.length && row[x] === row[start]) continue;
                const pixel = row[start];
                if (pixel !== ".") {
                    result.push({
                        x: start,
                        y,
                        width: x - start,
                        color: PIXEL_ICON_COLORS[pixel as keyof typeof PIXEL_ICON_COLORS],
                    });
                }
                start = x;
            }
            return result;
        }),
    );
</script>

<svg
    data-testid="pixel-icon"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    shape-rendering="crispEdges"
    aria-hidden="true"
>
    {#each runs as run, index (index)}
        <rect x={run.x} y={run.y} width={run.width} height="1" fill={run.color} />
    {/each}
</svg>
