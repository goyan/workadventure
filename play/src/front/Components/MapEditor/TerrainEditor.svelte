<script lang="ts">
    import {
        defaultForcePx,
        MAX_DEPTH_TILES,
        DEFAULT_WATER_SETTINGS,
        MAX_WATER_CURRENT,
        MAX_WATER_INDOOR_DRAIN,
        MAX_WATER_MAX_SURFACE,
        REALISTIC_WATER_SETTINGS,
        WATER_PACE_BOUNDS,
        WAVE_BOUNDS,
        MAX_WATER_SPEED,
        MEADOW_BOUNDS,
        SOILS,
        soilCode,
        soilName,
        TILE_PX,
    } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { executeUpdateTerrain, executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import { readTerrainMapSettings } from "../../Phaser/Game/Terrain/TerrainMapSettings";
    import {
        terrainBlockedStore,
        terrainBrushStore,
        terrainContoursStore,
        terrainHoverHeightStore,
        terrainHoverMeadowStore,
        terrainHoverSoilStore,
    } from "../../Stores/TerrainEditorStore";
    import { SOIL_TINTS } from "../../Phaser/Game/Terrain/TerrainShading";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";
    import TerrainWaterDashboard from "./TerrainWaterDashboard.svelte";

    /** The widest brush, in tiles, and the strongest stroke, in pixels of altitude. */
    const MAX_DIAMETER_TILES = 12;
    const MAX_FORCE_PX = 64;
    // Filling up to the ground only is what flattening towards the level of the ground does: no button of its own.
    const MODES = ["dig", "raise", "flatten", "smooth", "soil"] as const;

    // What the map says now; each slider below writes its change back to the map, for every editor.
    const saved = readTerrainMapSettings();
    let maxDepthTiles = $state(saved.maxDepthTiles);
    let runoff = $state(saved.runoff);
    let evaporation = $state(saved.evaporation);
    let speed = $state(saved.speed);
    let absorption = $state(saved.absorption);
    let current = $state(saved.current);
    let maxSurface = $state(saved.maxSurface);
    let indoorDrain = $state(saved.indoorDrain);
    let inertia = $state(saved.inertia);
    let waveRoughness = $state(saved.waves.roughness);
    let waveDamping = $state(saved.waves.damping);
    let waveBreaking = $state(saved.waves.breaking);
    let waveMomentum = $state(saved.waves.momentum);
    let precision = $state(saved.precision);
    let updates = $state(saved.updates);

    let diameterTiles = $state($terrainBrushStore.diameterTiles);
    let forceAuto = $state($terrainBrushStore.forcePx === undefined);
    let forcePx = $state($terrainBrushStore.forcePx ?? defaultForcePx($terrainBrushStore.diameterTiles));
    // The force follows the diameter while it is automatic.
    let shownForce = $derived(forceAuto ? Math.round(defaultForcePx(diameterTiles)) : forcePx);

    // The flatten mode goes to the level of the ground where the stroke starts, until a depth is chosen here.
    let flattenFromStart = $state($terrainBrushStore.targetPx === undefined);
    let flattenLevelPx = $state($terrainBrushStore.targetPx ?? 0);

    function setBrush(): void {
        terrainBrushStore.update((brush) => ({
            ...brush,
            diameterTiles,
            forcePx: forceAuto ? undefined : forcePx,
            targetPx: flattenFromStart ? undefined : flattenLevelPx,
        }));
    }

    /** Every setting of the water back to what it is in reality, and saved. */
    function setRealistic(): void {
        ({ runoff, evaporation, speed, absorption, current, maxSurface, indoorDrain, inertia } =
            REALISTIC_WATER_SETTINGS);
        waveRoughness = REALISTIC_WATER_SETTINGS.waves.roughness;
        waveDamping = REALISTIC_WATER_SETTINGS.waves.damping;
        waveBreaking = REALISTIC_WATER_SETTINGS.waves.breaking;
        waveMomentum = REALISTIC_WATER_SETTINGS.waves.momentum;
        precision = REALISTIC_WATER_SETTINGS.precision;
        updates = REALISTIC_WATER_SETTINGS.updates;
        saveWater();
    }

    function saveWater(): void {
        executeUpdateWAMSettings({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: {
                runoff,
                evaporation,
                speed,
                absorption,
                current,
                maxSurface,
                indoorDrain,
                inertia,
                updates,
                // The waves only matter to the water with inertia: a map without it keeps what it had.
                ...(inertia ? { waveRoughness, waveDamping, waveBreaking, waveMomentum, precision } : {}),
            },
        }).catch((error: unknown) => console.error("The pace of the water could not be saved", error));
    }

    let meadowOn = $state(saved.meadow.enabled);
    let growMinutes = $state(saved.meadow.growMinutes);
    let thirstMinutes = $state(saved.meadow.thirstMinutes);
    let moistureHold = $state(saved.meadow.moistureHold);

    function saveMeadow(): void {
        executeUpdateWAMSettings({
            $case: "updateMeadowSettingMessage",
            updateMeadowSettingMessage: { enabled: meadowOn, growMinutes, thirstMinutes, moistureHold },
        }).catch((error: unknown) => console.error("The settings of the meadow could not be saved", error));
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
    <div class="grid grid-cols-2 gap-2">
        {#each MODES as mode (mode)}
            <button
                type="button"
                class="btn btn-sm {$terrainBrushStore.mode === mode ? 'btn-secondary' : 'btn-light btn-ghost'}"
                aria-pressed={$terrainBrushStore.mode === mode}
                data-testid="terrain-mode-{mode}"
                onclick={() => terrainBrushStore.update((brush) => ({ ...brush, mode }))}
            >
                {$LL.mapEditor.terrain[mode]()}
            </button>
        {/each}
    </div>
    <p class="retro-hint m-0">{$LL.mapEditor.terrain.hint()}</p>
    {#if $terrainBrushStore.mode === "flatten"}
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.flattenHint()}</p>
        <div data-testid="terrain-flatten-from-start">
            <InputSwitch
                id="terrain-flatten-from-start"
                bind:value={flattenFromStart}
                label={$LL.mapEditor.terrain.flattenFromStart()}
                labelPosition="right"
                onchange={setBrush}
            />
        </div>
        {#if !flattenFromStart}
            <div data-testid="terrain-flatten-depth">
                <RangeSlider
                    id="terrain-flatten-depth"
                    label={$LL.mapEditor.terrain.flattenDepth()}
                    unit="px"
                    min={-maxDepthTiles * TILE_PX}
                    max={maxDepthTiles * TILE_PX}
                    step={1}
                    bind:value={flattenLevelPx}
                    onchange={setBrush}
                    buttonShape="square"
                />
            </div>
        {/if}
    {:else if $terrainBrushStore.mode === "smooth"}
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.smoothHint()}</p>
    {:else if $terrainBrushStore.mode === "soil"}
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.soilHint()}</p>
        <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label={$LL.mapEditor.terrain.soil()}>
            {#each SOILS as name (name)}
                <button
                    type="button"
                    role="radio"
                    class="btn btn-sm justify-start gap-2 {($terrainBrushStore.soil ?? 0) === soilCode(name)
                        ? 'btn-secondary'
                        : 'btn-light btn-ghost'}"
                    aria-checked={($terrainBrushStore.soil ?? 0) === soilCode(name)}
                    data-testid="terrain-soil-{name}"
                    onclick={() => terrainBrushStore.update((brush) => ({ ...brush, soil: soilCode(name) }))}
                >
                    <span
                        class="inline-block h-3 w-3 shrink-0 rounded-sm border border-white/40"
                        style="background:#{SOIL_TINTS[name].color.toString(16).padStart(6, '0')}"
                    ></span>
                    {$LL.mapEditor.terrain.soils[name]()}
                </button>
            {/each}
            <button
                type="button"
                role="radio"
                class="btn btn-sm col-span-2 {($terrainBrushStore.soil ?? 0) === 0
                    ? 'btn-secondary'
                    : 'btn-light btn-ghost'}"
                aria-checked={($terrainBrushStore.soil ?? 0) === 0}
                data-testid="terrain-soil-none"
                onclick={() => terrainBrushStore.update((brush) => ({ ...brush, soil: 0 }))}
            >
                {$LL.mapEditor.terrain.soilErase()}
            </button>
        </div>
    {/if}
    {#if $terrainHoverHeightStore !== undefined}
        <p class="m-0 text-sm text-white" role="status" data-testid="terrain-hover-height">
            {#if $terrainHoverHeightStore < 0}
                {$LL.mapEditor.terrain.hoverHeight({ depth: -$terrainHoverHeightStore })}
            {:else if $terrainHoverHeightStore > 0}
                {$LL.mapEditor.terrain.hoverAbove({ height: $terrainHoverHeightStore })}
            {:else}
                {$LL.mapEditor.terrain.hoverLevel()}
            {/if}
        </p>
    {/if}
    {#if $terrainHoverSoilStore}
        {@const hovered = soilName($terrainHoverSoilStore)}
        {#if hovered}
            <p class="m-0 text-sm text-white" role="status" data-testid="terrain-hover-soil">
                {$LL.mapEditor.terrain.hoverSoil({ soil: $LL.mapEditor.terrain.soils[hovered]() })}
            </p>
        {/if}
    {/if}
    {#if $terrainHoverMeadowStore}
        <p class="m-0 text-sm text-white" role="status" data-testid="terrain-hover-meadow">
            {$LL.mapEditor.terrain.hoverMeadow({
                moisture: Math.round($terrainHoverMeadowStore.moisture * 100),
                grass: Math.round($terrainHoverMeadowStore.grass * 100),
            })}
        </p>
    {/if}
    <div data-testid="terrain-contours">
        <InputSwitch
            id="terrain-contours"
            bind:value={$terrainContoursStore}
            label={$LL.mapEditor.terrain.contours()}
            labelPosition="right"
        />
    </div>
    <p class="retro-hint m-0" data-testid="terrain-water-marks">
        <span class="whitespace-nowrap"
            ><span class="inline-block h-2.5 w-2.5 rounded-full align-middle" style="background:#2f9bff"></span>
            {$LL.mapEditor.terrain.markSource()}</span
        >
        <span class="whitespace-nowrap"
            ><span class="inline-block h-2.5 w-2.5 rounded-full align-middle" style="background:#ff8a1f"></span>
            {$LL.mapEditor.terrain.markSink()}</span
        >
        — {$LL.mapEditor.terrain.marks()}
    </p>
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
    <div data-testid="terrain-water-realistic">
        <button type="button" class="btn btn-sm btn-light btn-ghost w-full" onclick={setRealistic}>
            {$LL.mapEditor.terrain.realistic()}
        </button>
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.realisticHint()}</p>
    </div>
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
    <div data-testid="terrain-indoor-drain">
        <RangeSlider
            id="terrain-indoor-drain"
            label={$LL.mapEditor.terrain.indoorDrain()}
            unit="mm/h"
            min={0}
            max={MAX_WATER_INDOOR_DRAIN}
            step={100}
            bind:value={indoorDrain}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.indoorDrain()}</p>
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
    <div data-testid="terrain-max-surface">
        <RangeSlider
            id="terrain-max-surface"
            label={$LL.mapEditor.terrain.maxSurface()}
            unit="px"
            min={DEFAULT_WATER_SETTINGS.maxSurface}
            max={MAX_WATER_MAX_SURFACE}
            step={1}
            bind:value={maxSurface}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.maxSurface()}</p>
    </div>
    <div data-testid="terrain-inertia">
        <InputSwitch
            id="terrain-inertia"
            bind:value={inertia}
            label={$LL.mapEditor.terrain.inertia()}
            labelPosition="right"
            onchange={saveWater}
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.real.inertia()}</p>
    </div>
    {#if inertia}
        <div data-testid="terrain-wave-roughness">
            <RangeSlider
                id="terrain-wave-roughness"
                label={$LL.mapEditor.terrain.waves.roughness()}
                unit="×"
                min={WAVE_BOUNDS.roughness[0]}
                max={WAVE_BOUNDS.roughness[1]}
                step={0.1}
                bind:value={waveRoughness}
                onchange={saveWater}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.waves.roughnessHint()}</p>
        </div>
        <div data-testid="terrain-wave-damping">
            <RangeSlider
                id="terrain-wave-damping"
                label={$LL.mapEditor.terrain.waves.damping()}
                unit="/s"
                min={WAVE_BOUNDS.damping[0]}
                max={WAVE_BOUNDS.damping[1]}
                step={0.01}
                bind:value={waveDamping}
                onchange={saveWater}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.waves.dampingHint()}</p>
        </div>
        <div data-testid="terrain-wave-breaking">
            <RangeSlider
                id="terrain-wave-breaking"
                label={$LL.mapEditor.terrain.waves.breaking()}
                unit="×"
                min={WAVE_BOUNDS.breaking[0]}
                max={WAVE_BOUNDS.breaking[1]}
                step={0.1}
                bind:value={waveBreaking}
                onchange={saveWater}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.waves.breakingHint()}</p>
        </div>
        <div data-testid="terrain-wave-momentum">
            <RangeSlider
                id="terrain-wave-momentum"
                label={$LL.mapEditor.terrain.waves.momentum()}
                unit="×"
                min={WAVE_BOUNDS.momentum[0]}
                max={WAVE_BOUNDS.momentum[1]}
                step={0.05}
                bind:value={waveMomentum}
                onchange={saveWater}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.waves.momentumHint()}</p>
        </div>
        <div data-testid="terrain-precision">
            <RangeSlider
                id="terrain-precision"
                label={$LL.mapEditor.terrain.precision()}
                unit=""
                min={WATER_PACE_BOUNDS.precision[0]}
                max={WATER_PACE_BOUNDS.precision[1]}
                step={1}
                bind:value={precision}
                onchange={saveWater}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.precisionHint()}</p>
        </div>
    {/if}
    <div data-testid="terrain-updates">
        <RangeSlider
            id="terrain-updates"
            label={$LL.mapEditor.terrain.updates()}
            unit="/s"
            min={WATER_PACE_BOUNDS.updates[0]}
            max={WATER_PACE_BOUNDS.updates[1]}
            step={1}
            bind:value={updates}
            onchange={saveWater}
            buttonShape="square"
        />
        <p class="retro-hint m-0">{$LL.mapEditor.terrain.updatesHint()}</p>
    </div>
    <p class="retro-hint m-0">{$LL.mapEditor.terrain.paceHint()}</p>

    <span class="retro-title mt-2">{$LL.mapEditor.terrain.meadow.title()}</span>
    <p class="retro-hint m-0">{$LL.mapEditor.terrain.meadow.hint()}</p>
    <div data-testid="terrain-meadow-enabled">
        <InputSwitch
            id="terrain-meadow-enabled"
            bind:value={meadowOn}
            label={$LL.mapEditor.terrain.meadow.enabled()}
            labelPosition="right"
            onchange={saveMeadow}
        />
    </div>
    {#if meadowOn}
        <div data-testid="terrain-meadow-grow">
            <RangeSlider
                id="terrain-meadow-grow"
                label={$LL.mapEditor.terrain.meadow.grow()}
                unit="min"
                min={MEADOW_BOUNDS.growMinutes[0]}
                max={MEADOW_BOUNDS.growMinutes[1]}
                step={1}
                bind:value={growMinutes}
                onchange={saveMeadow}
                buttonShape="square"
            />
        </div>
        <div data-testid="terrain-meadow-thirst">
            <RangeSlider
                id="terrain-meadow-thirst"
                label={$LL.mapEditor.terrain.meadow.thirst()}
                unit="min"
                min={MEADOW_BOUNDS.thirstMinutes[0]}
                max={MEADOW_BOUNDS.thirstMinutes[1]}
                step={1}
                bind:value={thirstMinutes}
                onchange={saveMeadow}
                buttonShape="square"
            />
        </div>
        <div data-testid="terrain-meadow-hold">
            <RangeSlider
                id="terrain-meadow-hold"
                label={$LL.mapEditor.terrain.meadow.hold()}
                unit="×"
                min={MEADOW_BOUNDS.moistureHold[0]}
                max={MEADOW_BOUNDS.moistureHold[1]}
                step={0.25}
                bind:value={moistureHold}
                onchange={saveMeadow}
                buttonShape="square"
            />
            <p class="retro-hint m-0">{$LL.mapEditor.terrain.meadow.holdHint()}</p>
        </div>
    {/if}
</div>
