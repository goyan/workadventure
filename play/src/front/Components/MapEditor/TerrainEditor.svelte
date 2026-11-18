<script lang="ts">
    import { defaultForcePx, MAX_DEPTH_TILES, MAX_WATER_CURRENT, MAX_WATER_SPEED } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { executeUpdateTerrain, executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import { readTerrainMapSettings } from "../../Phaser/Game/Terrain/TerrainMapSettings";
    import { terrainBlockedStore, terrainBrushStore } from "../../Stores/TerrainEditorStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";
    import TerrainWaterDashboard from "./TerrainWaterDashboard.svelte";

    /** The widest brush, in tiles, and the strongest stroke, in pixels of altitude. */
    const MAX_DIAMETER_TILES = 12;
    const MAX_FORCE_PX = 64;

    // What the map says now; each slider below writes its change back to the map, for every editor.
    const saved = readTerrainMapSettings();
    let maxDepthTiles = $state(saved.maxDepthTiles);
    let runoff = $state(saved.runoff);
    let evaporation = $state(saved.evaporation);
    let speed = $state(saved.speed);
    let absorption = $state(saved.absorption);
    let current = $state(saved.current);

    let diameterTiles = $state($terrainBrushStore.diameterTiles);
    let forceAuto = $state($terrainBrushStore.forcePx === undefined);
    let forcePx = $state($terrainBrushStore.forcePx ?? defaultForcePx($terrainBrushStore.diameterTiles));
    // The force follows the diameter while it is automatic.
    let shownForce = $derived(forceAuto ? Math.round(defaultForcePx(diameterTiles)) : forcePx);

    function setBrush(): void {
        terrainBrushStore.update((brush) => ({ ...brush, diameterTiles, forcePx: forceAuto ? undefined : forcePx }));
    }

    function saveWater(): void {
        executeUpdateWAMSettings({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: { runoff, evaporation, speed, absorption, current },
        }).catch((error: unknown) => console.error("The pace of the water could not be saved", error));
    }

    function saveMaxDepth(): void {
        executeUpdateTerrain(new Map(), maxDepthTiles).catch((error: unknown) =>
            console.error("The maximum depth could not be saved", error),
        );
    }
</script>

<!-- Like the panel of the Map tool: it scrolls when it is taller than the room the editor leaves it. -->
<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3" data-testid="terrain-editor">
    <span class="retro-title">{$LL.mapEditor.terrain.title()}</span>
    <div class="flex gap-2">
        <button
            type="button"
            class="btn btn-sm grow {$terrainBrushStore.mode === 'dig' ? 'btn-secondary' : 'btn-light btn-ghost'}"
            aria-pressed={$terrainBrushStore.mode === "dig"}
            data-testid="terrain-mode-dig"
            onclick={() => terrainBrushStore.update((brush) => ({ ...brush, mode: "dig" }))}
        >
            {$LL.mapEditor.terrain.dig()}
        </button>
        <button
            type="button"
            class="btn btn-sm grow {$terrainBrushStore.mode === 'fill' ? 'btn-secondary' : 'btn-light btn-ghost'}"
            aria-pressed={$terrainBrushStore.mode === "fill"}
            data-testid="terrain-mode-fill"
            onclick={() => terrainBrushStore.update((brush) => ({ ...brush, mode: "fill" }))}
        >
            {$LL.mapEditor.terrain.fill()}
        </button>
    </div>
    <p class="retro-hint m-0">{$LL.mapEditor.terrain.hint()}</p>
    {#if $terrainBlockedStore}
        <p class="retro-hint m-0 text-danger-500" role="status" data-testid="terrain-blocked">
            {$LL.mapEditor.terrain.blocked()}
        </p>
    {/if}

    <div data-testid="terrain-diameter">
        <RangeSlider
            id="terrain-diameter"
            label={$LL.mapEditor.terrain.diameter()}
            unit=""
            min={1}
            max={MAX_DIAMETER_TILES}
            step={1}
            bind:value={diameterTiles}
            onchange={setBrush}
            buttonShape="square"
        />
    </div>
    <div data-testid="terrain-force-auto">
        <InputSwitch
            id="terrain-force-auto"
            bind:value={forceAuto}
            label={$LL.mapEditor.terrain.forceAuto()}
            labelPosition="right"
            onchange={setBrush}
        />
    </div>
    <div data-testid="terrain-force" class={forceAuto ? "opacity-60" : ""}>
        {#if forceAuto}
            <span class="text-sm text-white">{$LL.mapEditor.terrain.force()} : {shownForce} px</span>
        {:else}
            <RangeSlider
                id="terrain-force"
                label={$LL.mapEditor.terrain.force()}
                unit="px"
                min={1}
                max={MAX_FORCE_PX}
                step={1}
                bind:value={forcePx}
                onchange={setBrush}
                buttonShape="square"
            />
        {/if}
    </div>

    <TerrainWaterDashboard {evaporation} {absorption} />

    <span class="retro-title mt-2">{$LL.mapEditor.terrain.mapSettings()}</span>
    <div data-testid="terrain-max-depth">
        <RangeSlider
            id="terrain-max-depth"
            label={$LL.mapEditor.terrain.maxDepth()}
            unit=""
            min={1}
            max={MAX_DEPTH_TILES}
            step={1}
            bind:value={maxDepthTiles}
            onchange={saveMaxDepth}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.maxDepth()}</p>
    </div>
    <div data-testid="terrain-runoff">
        <RangeSlider
            id="terrain-runoff"
            label={$LL.mapEditor.terrain.runoff()}
            unit="×"
            min={0}
            max={100}
            step={1}
            bind:value={runoff}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.runoff()}</p>
    </div>
    <div data-testid="terrain-evaporation">
        <RangeSlider
            id="terrain-evaporation"
            label={$LL.mapEditor.terrain.evaporation()}
            unit="mm/h"
            min={0}
            max={10}
            step={0.1}
            bind:value={evaporation}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.evaporation()}</p>
    </div>
    <div data-testid="terrain-absorption">
        <RangeSlider
            id="terrain-absorption"
            label={$LL.mapEditor.terrain.absorption()}
            unit="mm/h"
            min={0}
            max={100}
            step={1}
            bind:value={absorption}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.absorption()}</p>
    </div>
    <div data-testid="terrain-speed">
        <RangeSlider
            id="terrain-speed"
            label={$LL.mapEditor.terrain.speed()}
            unit="×"
            min={1}
            max={MAX_WATER_SPEED}
            step={1}
            bind:value={speed}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.speed()}</p>
    </div>
    <div data-testid="terrain-current">
        <RangeSlider
            id="terrain-current"
            label={$LL.mapEditor.terrain.current()}
            unit="×"
            min={0}
            max={MAX_WATER_CURRENT}
            step={0.1}
            bind:value={current}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.current()}</p>
    </div>
    <p class="retro-hint m-0">{$LL.mapEditor.terrain.paceHint()}</p>
</div>
