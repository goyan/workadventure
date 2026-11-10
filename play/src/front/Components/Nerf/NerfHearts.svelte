<script lang="ts">
    import { nerfHeartsStore } from "../../Stores/NerfStore";
    import { LL } from "../../../i18n/i18n-svelte";
    import { heartFill, NERF_HEARTS, NERF_THIRDS_PER_HEART } from "../../Phaser/Game/Nerf/NerfHearts";
    import {
        heartPixels,
        NERF_HEART_COLORS,
        NERF_HEART_HEIGHT,
        NERF_HEART_WIDTH,
    } from "../../Phaser/Game/Nerf/NerfHeartShape";

    /** Screen pixels per pixel of the heart. */
    const PIXEL = 4;

    const color = (value: number) => `#${value.toString(16).padStart(6, "0")}`;
    const hearts = $derived(
        $nerfHeartsStore
            ? Array.from({ length: NERF_HEARTS }, (_, index) => heartPixels(heartFill($nerfHeartsStore.thirds, index)))
            : [],
    );
</script>

{#if $nerfHeartsStore}
    <div class="pointer-events-none absolute left-4 top-20 z-[300] flex flex-col gap-1 select-none">
        <div
            class="flex gap-1"
            role="img"
            aria-label={$LL.actionbar.nerf.hearts.label({
                hearts: Math.floor($nerfHeartsStore.thirds / NERF_THIRDS_PER_HEART),
                thirds: $nerfHeartsStore.thirds % NERF_THIRDS_PER_HEART,
            })}
        >
            {#each hearts as pixels, index (index)}
                <svg
                    width={NERF_HEART_WIDTH * PIXEL}
                    height={NERF_HEART_HEIGHT * PIXEL}
                    viewBox="0 0 {NERF_HEART_WIDTH} {NERF_HEART_HEIGHT}"
                    shape-rendering="crispEdges"
                    aria-hidden="true"
                >
                    {#each pixels as pixel (`${pixel.x}:${pixel.y}`)}
                        <rect
                            x={pixel.x}
                            y={pixel.y}
                            width="1"
                            height="1"
                            fill={color(pixel.filled ? NERF_HEART_COLORS.full : NERF_HEART_COLORS.empty)}
                        />
                    {/each}
                </svg>
            {/each}
        </div>
        {#if $nerfHeartsStore.jailed}
            <p class="m-0 rounded bg-contrast/80 px-2 py-1 text-sm text-white">{$LL.actionbar.nerf.hearts.jailed()}</p>
        {/if}
    </div>
{/if}
