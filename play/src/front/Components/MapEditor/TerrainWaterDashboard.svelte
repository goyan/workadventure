<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { signedWaterFigure, waterFigure } from "../../Phaser/Game/Terrain/WaterFigures";
    import { terrainWaterStatsStore } from "../../Stores/TerrainEditorStore";

    interface Props {
        /** The settings of the map, shown beside what they take (mm an hour). */
        evaporation: number;
        absorption: number;
    }

    let { evaporation, absorption }: Props = $props();

    let stats = $derived($terrainWaterStatsStore);
    // Every flow in cubic metres an hour of the time of the map: the only unit in which a rain compares with a source.
    let inflows = $derived(
        stats
            ? [
                  {
                      name: "rain",
                      label: $LL.mapEditor.terrain.dashboard.rain(),
                      value: stats.rain,
                      own: `${waterFigure(stats.rainRate)} mm/h`,
                  },
                  { name: "sources", label: $LL.mapEditor.terrain.dashboard.sources(), value: stats.sources, own: "" },
              ]
            : [],
    );
    let outflows = $derived(
        stats
            ? [
                  { name: "sinks", label: $LL.mapEditor.terrain.dashboard.sinks(), value: stats.sinks, own: "" },
                  {
                      name: "evaporation",
                      label: $LL.mapEditor.terrain.dashboard.evaporation(),
                      value: stats.evaporation,
                      own: `${waterFigure(evaporation)} mm/h`,
                  },
                  {
                      name: "absorption",
                      label: $LL.mapEditor.terrain.dashboard.absorption(),
                      value: stats.absorption,
                      own: `${waterFigure(absorption)} mm/h`,
                  },
                  { name: "lost", label: $LL.mapEditor.terrain.dashboard.lost(), value: stats.lost, own: "" },
              ]
            : [],
    );
    let largest = $derived(Math.max(0, ...inflows.map((row) => row.value), ...outflows.map((row) => row.value)));
    let balance = $derived(
        inflows.reduce((sum, row) => sum + row.value, 0) - outflows.reduce((sum, row) => sum + row.value, 0),
    );
    let trend = $derived(
        signedWaterFigure(balance) === "0"
            ? $LL.mapEditor.terrain.dashboard.steady()
            : balance > 0
              ? $LL.mapEditor.terrain.dashboard.rising()
              : $LL.mapEditor.terrain.dashboard.falling(),
    );
    const share = (value: number): number => (largest > 0 ? Math.round((value / largest) * 100) : 0);
</script>

{#snippet flowRow(row: { name: string; label: string; value: number; own: string }, color: string)}
    <div class="flex flex-col gap-0.5" data-testid="water-row-{row.name}">
        <div class="flex items-baseline justify-between gap-2 text-xs">
            <span class="text-white"
                >{row.label}{#if row.own}<span class="text-white/50"> · {row.own}</span>{/if}</span
            >
            <span class="text-white tabular-nums whitespace-nowrap">{waterFigure(row.value)} m³/h</span>
        </div>
        <div class="h-1.5 w-full rounded bg-white/10">
            <div class="h-1.5 rounded {color}" style="width: {share(row.value)}%" data-testid="water-bar"></div>
        </div>
    </div>
{/snippet}

<div class="flex flex-col gap-2" data-testid="terrain-water-dashboard">
    <span class="retro-title">{$LL.mapEditor.terrain.dashboard.title()}</span>
    {#if !stats}
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.dashboard.waiting()}</p>
    {:else}
        <span class="text-xs text-white/60">{$LL.mapEditor.terrain.dashboard.inflows()}</span>
        {#each inflows as row (row.name)}
            {@render flowRow(row, "bg-sky-400")}
        {/each}
        <span class="text-xs text-white/60">{$LL.mapEditor.terrain.dashboard.outflows()}</span>
        {#each outflows as row (row.name)}
            {@render flowRow(row, "bg-amber-400")}
        {/each}
        <div class="flex items-baseline justify-between gap-2 text-xs" data-testid="water-row-balance">
            <span class="text-white">{$LL.mapEditor.terrain.dashboard.balance()} · {trend}</span>
            <span class="text-white tabular-nums whitespace-nowrap">{signedWaterFigure(balance)} m³/h</span>
        </div>
        <div class="flex items-baseline justify-between gap-2 text-xs" data-testid="water-row-stock">
            <span class="text-white">
                {$LL.mapEditor.terrain.dashboard.stock()}
                <span class="text-white/50">
                    · {$LL.mapEditor.terrain.dashboard.wetArea()} {waterFigure(stats.wetArea)} m²</span
                >
            </span>
            <span class="text-white tabular-nums whitespace-nowrap">{waterFigure(stats.stock)} m³</span>
        </div>
    {/if}
</div>
