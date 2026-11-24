<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        applyGraphicsQuality,
        GRAPHICS_PRESETS,
        GraphicsQuality,
        graphicsQualityStore,
    } from "../../Stores/GraphicsSettingsStore";
    import { graphicsMetricsRequestedStore, perfStatsStore } from "../../Stores/PerfStore";
    import SettingsSection from "./SettingsSection.svelte";

    const labels = $derived($LL.menu.settings.graphicsQuality);
    $effect(() => {
        graphicsMetricsRequestedStore.set(true);
        return () => graphicsMetricsRequestedStore.set(false);
    });
</script>

<SettingsSection title={labels.title()} dataTestId="graphics-quality-settings">
    <div class="grid grid-cols-2 gap-2 @lg/main-layout:grid-cols-4" role="group" aria-label={labels.title()}>
        {#each GRAPHICS_PRESETS as quality (quality)}
            <button
                type="button"
                class="rounded-lg border border-white/15 px-3 py-3 text-sm text-white hover:bg-white/10 {$graphicsQualityStore ===
                quality
                    ? 'bg-secondary/30'
                    : 'bg-black/20'}"
                aria-pressed={$graphicsQualityStore === quality}
                data-testid={`graphics-quality-${quality}`}
                onclick={() => applyGraphicsQuality(quality)}
            >
                <span class="block font-bold">{labels[quality]()}</span>
                <span class="block text-xs text-white/70">{labels.cost[quality]()}</span>
            </button>
        {/each}
    </div>
    <p class="m-0 text-sm text-white/80">{labels.current({ quality: labels[$graphicsQualityStore]() })}</p>
    <p class="m-0 text-xs text-white/60">
        {labels.description[
            $graphicsQualityStore === GraphicsQuality.Custom ? GraphicsQuality.Custom : $graphicsQualityStore
        ]()}
    </p>
    {#if $perfStatsStore}
        <p class="m-0 text-sm text-white tabular-nums" data-testid="graphics-metrics">
            {labels.metrics({
                fps: Math.round($perfStatsStore.fps),
                cpu: ($perfStatsStore.updateMs + $perfStatsStore.renderMs).toFixed(1),
                budget: Math.round((($perfStatsStore.updateMs + $perfStatsStore.renderMs) / (1000 / 60)) * 100),
            })}
        </p>
    {:else}
        <p class="m-0 text-xs text-white/60">{labels.waiting()}</p>
    {/if}
    <p class="m-0 text-xs text-white/60">{labels.help()}</p>
</SettingsSection>
