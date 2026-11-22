<script lang="ts">
    import { worldShadeAt } from "../../Phaser/Game/Night/WorldDaylight";
    import type { WorldPoint } from "../../Phaser/Game/Night/WorldDaylight";
    import { NIGHT_MAX_OPACITY } from "../../Phaser/Game/Night/NightClock";
    import { pointOnWorldMap, WORLD_MAP, WORLD_MAP_HEIGHT, WORLD_MAP_WIDTH } from "./WorldMap";

    interface Props {
        /** The place marked on the map; none: no mark. */
        marker: WorldPoint | undefined;
        /** The instant the day and the night are drawn at; none: the map alone. */
        date: Date | undefined;
        /** A point chosen with a click on the map. */
        onpick: (point: WorldPoint) => void;
        testid: string;
        /** What the map is for, said to screen readers. */
        label: string;
    }

    let { marker, date, onpick, testid, label }: Props = $props();

    let canvas: HTMLCanvasElement | undefined = $state();
    let image: HTMLImageElement | undefined = $state();

    // The map of the world, with the night where it is night now, and the place marked.
    $effect(() => {
        const context = canvas?.getContext("2d");
        const shown = image;
        const at = date;
        const mark = marker;
        if (!canvas || !shown?.complete || !context) return;
        context.imageSmoothingEnabled = false;
        context.drawImage(shown, 0, 0, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT);
        if (at) {
            const shade = context.getImageData(0, 0, WORLD_MAP_WIDTH, WORLD_MAP_HEIGHT);
            for (let y = 0; y < WORLD_MAP_HEIGHT; y++) {
                const latitude = 90 - ((y + 0.5) * 180) / WORLD_MAP_HEIGHT;
                for (let x = 0; x < WORLD_MAP_WIDTH; x++) {
                    // Day: as it is; dusk: darker little by little; night: dark blue. The night veil of the game.
                    const dark =
                        worldShadeAt(at, latitude, ((x + 0.5) * 360) / WORLD_MAP_WIDTH - 180) * NIGHT_MAX_OPACITY;
                    const index = (y * WORLD_MAP_WIDTH + x) * 4;
                    shade.data[index] = shade.data[index] * (1 - dark) + 10 * dark;
                    shade.data[index + 1] = shade.data[index + 1] * (1 - dark) + 20 * dark;
                    shade.data[index + 2] = shade.data[index + 2] * (1 - dark) + 50 * dark;
                }
            }
            context.putImageData(shade, 0, 0);
        }
        if (mark) {
            const x = ((mark.longitude + 180) * WORLD_MAP_WIDTH) / 360;
            const y = ((90 - mark.latitude) * WORLD_MAP_HEIGHT) / 180;
            context.fillStyle = "#ffd34d";
            context.strokeStyle = "#1b1b1b";
            context.beginPath();
            context.arc(x, y, 3.5, 0, Math.PI * 2);
            context.fill();
            context.stroke();
        }
    });

    /** A click on the map: the latitude and the longitude of that point, read from its place on the map. */
    function pick(event: MouseEvent): void {
        if (!(event.currentTarget instanceof HTMLCanvasElement)) return;
        onpick(pointOnWorldMap(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY));
    }
</script>

<img src={WORLD_MAP} alt="" class="hidden" bind:this={image} onload={() => (image = image)} />
<canvas
    bind:this={canvas}
    width={WORLD_MAP_WIDTH}
    height={WORLD_MAP_HEIGHT}
    class="w-full cursor-crosshair rounded [image-rendering:pixelated]"
    aria-label={label}
    data-testid={testid}
    onclick={pick}
></canvas>
