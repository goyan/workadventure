<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { FLOW_SPEED_SCALE, SLOWEST_TOLD_SPEED } from "../../Phaser/Game/Terrain/WaterFlowField";
    import { FALLING_COLOR, RISING_COLOR } from "../../Phaser/Game/Terrain/WaterFlowOverlay";
    import { terrainWaterStatsStore } from "../../Stores/TerrainEditorStore";
    import {
        visualisationPanelStore,
        waterFlowMeasuredStore,
        waterFlowOverlayStore,
        weatherExplainedStore,
    } from "../../Stores/VisualisationStore";
    import WeatherBoardLive from "./WeatherBoardLive.svelte";
    import { IconCloud, IconDroplet } from "@wa-icons";

    const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;
    // The scale of the speeds, as the arrows are coloured: evenly spread along the bar.
    const gradient = `linear-gradient(to right, ${FLOW_SPEED_SCALE.map((stop) => css(stop.color)).join(", ")})`;
    const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    const slowestTold = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(SLOWEST_TOLD_SPEED);
    const stats = $derived($terrainWaterStatsStore);
    const flowing = $derived($waterFlowOverlayStore);
    const explaining = $derived($weatherExplainedStore);
</script>

{#if $visualisationPanelStore}
    <div class="pointer-events-auto flex flex-col items-start gap-1 text-xs" data-testid="visualisation-widget">
        <div
            class="flex items-center gap-3 rounded-full bg-contrast/80 py-1 pe-3 ps-1 backdrop-blur"
            role="group"
            aria-label={$LL.actionbar.visualisation.label()}
        >
            <button
                type="button"
                class="flex items-center gap-1 rounded-full px-2 py-1 {flowing
                    ? 'bg-white/30 ring-1 ring-white'
                    : 'bg-white/10 hover:bg-white/20'}"
                aria-pressed={flowing}
                data-testid="visualisation-water-flow"
                onclick={() => waterFlowOverlayStore.update((shown) => !shown)}
            >
                <IconDroplet width="16" height="16" />
                <span>{$LL.actionbar.visualisation.waterFlow()}</span>
            </button>
            <button
                type="button"
                class="flex items-center gap-1 rounded-full px-2 py-1 {explaining
                    ? 'bg-white/30 ring-1 ring-white'
                    : 'bg-white/10 hover:bg-white/20'}"
                aria-pressed={explaining}
                data-testid="visualisation-weather-explained"
                onclick={() => weatherExplainedStore.update((shown) => !shown)}
            >
                <IconCloud width="16" height="16" />
                <span>{$LL.actionbar.visualisation.weather.button()}</span>
            </button>
            <span class="opacity-70">
                {flowing ? $LL.actionbar.visualisation.onHelp() : $LL.actionbar.visualisation.offHelp()}
            </span>
        </div>
        {#if flowing}
            <div
                class="flex max-w-xs flex-col gap-1.5 rounded-xl bg-contrast/80 p-2 backdrop-blur"
                data-testid="visualisation-water-flow-legend"
            >
                <div>
                    <div class="mb-0.5">{$LL.actionbar.visualisation.speed()}</div>
                    <div class="h-2 w-full rounded-full" style="background: {gradient}"></div>
                    <div class="flex justify-between opacity-80">
                        {#each FLOW_SPEED_SCALE as stop (stop.speed)}
                            <span>{stop.speed}{stop === FLOW_SPEED_SCALE[FLOW_SPEED_SCALE.length - 1] ? "+" : ""}</span>
                        {/each}
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="flex items-center gap-1">
                        <span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: {css(RISING_COLOR)}"
                        ></span>
                        {$LL.actionbar.visualisation.rising()}
                    </span>
                    <span class="flex items-center gap-1">
                        <span class="inline-block h-2.5 w-2.5 rounded-sm" style="background: {css(FALLING_COLOR)}"
                        ></span>
                        {$LL.actionbar.visualisation.falling()}
                    </span>
                </div>
                <div class="opacity-80">{$LL.actionbar.visualisation.trend()}</div>
                <div class="opacity-80">{$LL.actionbar.visualisation.masses()}</div>
                <div class="opacity-80">{$LL.actionbar.visualisation.realTime()}</div>
                {#if stats}
                    <div data-testid="visualisation-water-totals">
                        {$LL.actionbar.visualisation.totals({
                            stock: whole.format(stats.stock),
                            area: whole.format(stats.wetArea),
                        })}
                    </div>
                {:else}
                    <div class="opacity-80" data-testid="visualisation-water-none">
                        {$LL.actionbar.visualisation.noWater()}
                    </div>
                {/if}
                <div class="opacity-60" data-testid="visualisation-water-speeds">
                    {$waterFlowMeasuredStore
                        ? $LL.actionbar.visualisation.measured({ slowest: slowestTold })
                        : $LL.actionbar.visualisation.estimated()}
                </div>
            </div>
        {/if}
        {#if explaining}
            <!-- Why this player sees the rain, the snow, the frost and the ice they see. -->
            <WeatherBoardLive />
        {/if}
    </div>
{/if}
