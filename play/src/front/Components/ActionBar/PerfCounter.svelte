<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { perfStatsStore } from "../../Stores/PerfStore";

    const labels = $derived($LL.actionbar.perf);
    const stats = $derived($perfStatsStore);
    // Under 30 images a second, or a wait of more than 50 ms between two: it shows on screen.
    const slow = $derived(stats !== undefined && (stats.fps < 30 || stats.worstMs > 50));
</script>

<div
    class="flex flex-col justify-center rounded-lg bg-contrast/80 px-3 py-1 text-xs leading-tight tabular-nums backdrop-blur {slow
        ? 'text-warning'
        : 'text-white'}"
    data-testid="perf-counter"
    title={labels.help()}
>
    {#if stats}
        <span class="font-bold">{labels.fps({ fps: Math.round(stats.fps) })}</span>
        <span class="text-white/70">
            {labels.detail({
                worst: Math.round(stats.worstMs),
                update: stats.updateMs.toFixed(1),
                render: stats.renderMs.toFixed(1),
            })}
        </span>
    {:else}
        <span>{labels.waiting()}</span>
    {/if}
</div>
