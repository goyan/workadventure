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
        weatherPipetteCellStore,
        weatherPipetteStore,
    } from "../../Stores/VisualisationStore";
    import WeatherBoardLive from "./WeatherBoardLive.svelte";
    import WeatherPipette from "./WeatherPipette.svelte";

    const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;
    // The scale of the speeds, as the arrows are coloured: evenly spread along the bar.
    const gradient = `linear-gradient(to right, ${FLOW_SPEED_SCALE.map((stop) => css(stop.color)).join(", ")})`;
    const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
    const slowestTold = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(SLOWEST_TOLD_SPEED);
    const stats = $derived($terrainWaterStatsStore);
    const flowing = $derived($waterFlowOverlayStore);
    const explaining = $derived($weatherExplainedStore);
    const probing = $derived($weatherPipetteStore);
</script>

<!-- What is shown over the map, read here: the legend of the flows of the water and the weather board. Their tiles are
     in the Visualisation chip of the clock line (VisualisationChip); this stays in the column under it, so that
     closing the tiles keeps them open. -->
{#if $visualisationPanelStore && (flowing || explaining || probing)}
    <div class="pointer-events-auto flex flex-col items-start gap-1 text-xs" data-testid="visualisation-shown">
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
        {#if probing}
            <!-- What goes on in the cell of the ground under the pointer: read only while this is on. -->
            <WeatherPipette cell={$weatherPipetteCellStore} />
        {/if}
        {#if explaining}
            <!-- Why this player sees the rain, the snow, the frost and the ice they see. -->
            <WeatherBoardLive />
        {/if}
    </div>
{/if}
