<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { fastWaterActiveStore, fastWaterPace, sharedWaterBackStore } from "../../Stores/FastWaterStore";
    import { terrainWaterStatsStore } from "../../Stores/TerrainEditorStore";

    /** The message « retour à l'eau partagée » stays this long (ms). */
    const BACK_SHOWN_MS = 3000;

    const labels = $derived($LL.actionbar.fastWater);
    const pace = $derived(fastWaterPace($terrainWaterStatsStore?.reachedSpeed));
    let back = $state(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = sharedWaterBackStore.subscribe((at) => {
        if (at === undefined) return;
        back = true;
        clearTimeout(timer);
        timer = setTimeout(() => (back = false), BACK_SHOWN_MS);
    });
    onDestroy(() => {
        unsubscribe();
        clearTimeout(timer);
    });
</script>

<!-- The water of this player alone goes faster: how fast, and how fast its currents keep up. -->
{#if $fastWaterActiveStore}
    <div
        class="flex items-center rounded-lg bg-contrast/80 px-3 py-1 text-xs leading-tight text-white tabular-nums backdrop-blur"
        data-testid="fast-water-badge"
        title={pace.higher === undefined ? labels.hint() : labels.capped({ factor: pace.higher.toFixed(1) })}
    >
        {pace.reached === undefined
            ? labels.badge({ speed: pace.speed })
            : labels.badgeCapped({ speed: pace.speed, reached: pace.reached })}
    </div>
{:else if back}
    <div
        class="flex items-center rounded-lg bg-contrast/80 px-3 py-1 text-xs leading-tight text-white/80 backdrop-blur"
        data-testid="fast-water-back"
    >
        {labels.back()}
    </div>
{/if}
