<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import {
        MAP_LAYER_FLOOR_FAMILIES,
        MAP_LAYER_WALL_HEIGHTS,
        MAP_LAYER_WALL_TINTS,
    } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
    import {
        mapLayerCatalogAvailableStore,
        mapLayerDoorHeightStore,
        mapLayerDoorHeightsAvailableStore,
        mapLayerDoorGlazedStore,
        mapLayerDoorsAvailableStore,
        mapLayerGlazedDoorHeightsAvailableStore,
        mapLayerGlazedDoorsAvailableStore,
        mapLayerHeightRequestStore,
        mapLayerHeightSelectionStore,
        mapLayerFloorFamilyStore,
        mapLayerFloorSwatchesStore,
        mapLayerModeStore,
        mapLayerStatusStore,
        mapLayerWallSwatchesStore,
        mapLayerWallHeightStore,
        mapLayerWallHeightsAvailableStore,
        mapLayerWallTintStore,
        mapLayerWindowHeightStore,
        mapLayerWindowHeightsAvailableStore,
        mapLayerWindowsAvailableStore,
        isFloorMode,
        mapLayerFloorsAvailableStore,
        mapLayerLevelStore,
        mapLayerLevelsStore,
        mapLayerStairDirectionStore,
        mapLayerStairTargetStore,
        mapLayerBuiltLevelsStore,
        mapLayerStairOpenStore,
        mapLayerStairWidthStore,
    } from "../../Stores/MapLayerStore";
    import { STAIR_DIRECTIONS, floorLevelTiles } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
    import { reachableLevels, stairTarget } from "../../Phaser/Game/MapEditor/MapLayer/FloorOperations";
    import type { MapLayerMode } from "../../Stores/MapLayerStore";
    import FloorLevelPicker from "./FloorLevelPicker.svelte";
    import {
        IconArrowAutofitHeight,
        IconBrush,
        IconStack2,
        IconStairs,
        IconBucket,
        IconDoor,
        IconEraser,
        IconHome,
        IconRectangle,
        IconWall,
        IconWindow,
    } from "@wa-icons";

    // "Freehand" modes act while the pointer moves, "area" modes act on the shape dragged between two points.
    const freehandModes: { mode: MapLayerMode; icon: typeof IconWall }[] = [
        { mode: "wall", icon: IconWall },
        { mode: "floorBrush", icon: IconBrush },
        { mode: "erase", icon: IconEraser },
    ];
    const areaModes: { mode: MapLayerMode; icon: typeof IconWall }[] = [
        { mode: "room", icon: IconHome },
        { mode: "floorRectangle", icon: IconRectangle },
        { mode: "floorFill", icon: IconBucket },
    ];

    const placedModes: { mode: MapLayerMode; icon: typeof IconWall }[] = [
        { mode: "door", icon: IconDoor },
        { mode: "window", icon: IconWindow },
        { mode: "height", icon: IconArrowAutofitHeight },
    ];

    // The raised floors: slabs laid on the top of the walls, their eraser, and the stairs.
    const floorModes: { mode: MapLayerMode; icon: typeof IconWall }[] = [
        { mode: "slab", icon: IconStack2 },
        { mode: "stair", icon: IconStairs },
        { mode: "slabErase", icon: IconEraser },
    ];

    /**
     * The name of a level: the height in tiles of the walls it stands on, and, once it has slabs on the map, its rank
     * among the floors (the lowest one is the floor 1).
     */
    function levelLabel(level: number, built: readonly number[]): string {
        const name = $LL.mapEditor.mapLayer.floorLevel.level({ height: floorLevelTiles(level) });
        const rank = built.indexOf(level) + 1;
        return rank > 0 ? `${name} · ${$LL.mapEditor.mapLayer.floorLevel.built({ rank })}` : name;
    }

    const stairArrows = { n: "↑", e: "→", s: "↓", o: "←" } as const;
    // What the stair preview draws on the map, with its colors (see MapLayerFloorEditing).
    const stairLegend = [
        { key: "firstStep", color: "#ffffff" },
        { key: "arrival", color: "#3b82f6" },
        { key: "missing", color: "#f97316" },
        { key: "well", color: "#ef4444" },
        { key: "refused", color: "#ef4444" },
        { key: "deadEnd", color: "#f97316" },
    ] as const;

    // The floors a stair can reach from the level being edited, and the one it goes up to.
    let stairTargets = $derived(reachableLevels($mapLayerLevelStore, $mapLayerLevelsStore));
    let chosenStairTarget = $derived(stairTarget(stairTargets, $mapLayerBuiltLevelsStore, $mapLayerStairTargetStore));

    let usesFloor = $derived(
        $mapLayerModeStore !== "wall" &&
            $mapLayerModeStore !== "slabErase" &&
            $mapLayerModeStore !== "stair" &&
            $mapLayerModeStore !== "erase" &&
            $mapLayerModeStore !== "door" &&
            $mapLayerModeStore !== "window" &&
            $mapLayerModeStore !== "height",
    );
    let usesWall = $derived($mapLayerModeStore === "wall" || $mapLayerModeStore === "room");

    // The height setting of the current mode: the walls (and the walls of a room), the doors or the windows.
    // The height mode shows the height of what is selected, and applies the one clicked to it.
    let heightKind = $derived<"wall" | "door" | "window" | "selection" | undefined>(
        usesWall
            ? "wall"
            : $mapLayerModeStore === "door"
              ? "door"
              : $mapLayerModeStore === "window"
                ? "window"
                : $mapLayerModeStore === "height"
                  ? "selection"
                  : undefined,
    );
    let heightStore = $derived(
        heightKind === "door"
            ? mapLayerDoorHeightStore
            : heightKind === "window"
              ? mapLayerWindowHeightStore
              : mapLayerWallHeightStore,
    );
    let heightsAvailable = $derived(
        heightKind === "selection"
            ? $mapLayerHeightSelectionStore.count > 0
                ? $mapLayerHeightSelectionStore.available
                : []
            : heightKind === "door"
              ? // A glazed door of a height needs its own pieces in the catalog.
                $mapLayerDoorGlazedStore && $mapLayerGlazedDoorsAvailableStore
                  ? $mapLayerGlazedDoorHeightsAvailableStore
                  : $mapLayerDoorHeightsAvailableStore
              : heightKind === "window"
                ? $mapLayerWindowHeightsAvailableStore
                : $mapLayerWallHeightsAvailableStore,
    );
    let chosenHeight = $derived(
        heightKind === "selection"
            ? $mapLayerHeightSelectionStore.height
            : heightKind === "door"
              ? $mapLayerDoorHeightStore
              : heightKind === "window"
                ? $mapLayerWindowHeightStore
                : $mapLayerWallHeightStore,
    );
</script>

{#snippet modeButton(mode: MapLayerMode, Icon: typeof IconWall)}
    <button
        type="button"
        disabled={(mode === "door" && !$mapLayerDoorsAvailableStore) ||
            (mode === "window" && !$mapLayerWindowsAvailableStore) ||
            (isFloorMode(mode) && !$mapLayerFloorsAvailableStore)}
        class="flex flex-col items-center gap-1 p-2 rounded text-xs disabled:opacity-40 {$mapLayerModeStore === mode
            ? 'bg-secondary'
            : 'bg-white/10 hover:bg-white/20'}"
        data-testid="mapLayerMode-{mode}"
        aria-pressed={$mapLayerModeStore === mode}
        onclick={() => mapLayerModeStore.set(mode)}
    >
        <Icon font-size="22" />
        <span class="text-center leading-tight">{$LL.mapEditor.mapLayer.modes[mode]()}</span>
    </button>
{/snippet}

{#snippet swatch(selected: boolean, label: string, source: string | undefined, onclick: () => void)}
    <button
        type="button"
        class="p-1 rounded flex flex-col items-center gap-1 text-xs {selected
            ? 'bg-secondary'
            : 'bg-white/10 hover:bg-white/20'}"
        aria-pressed={selected}
        title={label}
        {onclick}
    >
        {#if source}
            <img src={source} alt={label} class="w-16 h-16 rounded-sm" style="image-rendering: pixelated" />
        {:else}
            <span class="w-16 h-16 rounded-sm bg-white/10"></span>
        {/if}
        <span class="leading-tight text-center">{label}</span>
    </button>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pe-1 text-white" data-testid="mapLayerEditor">
    <h2 class="text-lg font-bold m-0">{$LL.mapEditor.mapLayer.title()}</h2>
    {#if $mapLayerCatalogAvailableStore && $mapLayerFloorsAvailableStore}
        <!-- The level edited, the same as in the objects panel. -->
        <FloorLevelPicker />
    {/if}

    {#if $mapLayerCatalogAvailableStore === undefined}
        <p class="m-0 text-sm opacity-80">{$LL.mapEditor.mapLayer.catalogLoading()}</p>
    {:else if $mapLayerCatalogAvailableStore === false}
        <p class="m-0 text-sm text-warning">{$LL.mapEditor.mapLayer.catalogMissing()}</p>
    {:else}
        <section class="flex flex-col gap-2">
            <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.groups.freehand()}</h3>
            <div class="grid grid-cols-3 gap-2">
                {#each freehandModes as { mode, icon } (mode)}
                    {@render modeButton(mode, icon)}
                {/each}
            </div>
        </section>
        <section class="flex flex-col gap-2">
            <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.groups.area()}</h3>
            <div class="grid grid-cols-3 gap-2">
                {#each areaModes as { mode, icon } (mode)}
                    {@render modeButton(mode, icon)}
                {/each}
            </div>
        </section>
        <section class="flex flex-col gap-2">
            <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.groups.placed()}</h3>
            <div class="grid grid-cols-3 gap-2">
                {#each placedModes as { mode, icon } (mode)}
                    {@render modeButton(mode, icon)}
                {/each}
            </div>
        </section>
        <section class="flex flex-col gap-2">
            <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.groups.floors()}</h3>
            <div class="grid grid-cols-3 gap-2">
                {#each floorModes as { mode, icon } (mode)}
                    {@render modeButton(mode, icon)}
                {/each}
            </div>
            {#if !$mapLayerFloorsAvailableStore}
                <p class="m-0 text-xs opacity-70">{$LL.mapEditor.mapLayer.floorLevel.unavailable()}</p>
            {:else}
                <details class="text-xs" data-testid="mapLayerFloorGuide">
                    <summary class="cursor-pointer opacity-80 hover:opacity-100">
                        {$LL.mapEditor.mapLayer.floorGuide.title()}
                    </summary>
                    <ol class="m-0 mt-1 flex list-decimal flex-col gap-1 ps-5 opacity-80">
                        <li>{$LL.mapEditor.mapLayer.floorGuide.step1()}</li>
                        <li>{$LL.mapEditor.mapLayer.floorGuide.step2()}</li>
                        <li>{$LL.mapEditor.mapLayer.floorGuide.step3()}</li>
                        <li>{$LL.mapEditor.mapLayer.floorGuide.step4()}</li>
                    </ol>
                </details>
            {/if}
        </section>
        <p class="m-0 text-sm opacity-80">{$LL.mapEditor.mapLayer.hints[$mapLayerModeStore]()}</p>

        {#if $mapLayerModeStore === "stair"}
            <section class="flex flex-col gap-2" data-testid="mapLayerStair">
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.stair.target()}</h3>
                {#if stairTargets.length === 0}
                    <p class="m-0 text-xs text-warning">{$LL.mapEditor.mapLayer.stair.noTarget()}</p>
                {:else}
                    <div class="flex flex-wrap gap-2">
                        {#each stairTargets as level (level)}
                            <button
                                type="button"
                                class="px-3 py-1 rounded text-xs {chosenStairTarget === level
                                    ? 'bg-secondary'
                                    : 'bg-white/10 hover:bg-white/20'}"
                                aria-pressed={chosenStairTarget === level}
                                title={$LL.mapEditor.mapLayer.floorLevel.levelHint({ height: floorLevelTiles(level) })}
                                data-testid="mapLayerStairTarget-{level}"
                                onclick={() => mapLayerStairTargetStore.set(level)}
                            >
                                {levelLabel(level, $mapLayerBuiltLevelsStore)}
                            </button>
                        {/each}
                    </div>
                {/if}
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.stair.direction()}</h3>
                <div class="flex flex-wrap gap-2">
                    {#each STAIR_DIRECTIONS as direction (direction)}
                        <button
                            type="button"
                            class="px-3 py-1 rounded text-xs {$mapLayerStairDirectionStore === direction
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={$mapLayerStairDirectionStore === direction}
                            data-testid="mapLayerStairDirection-{direction}"
                            onclick={() => mapLayerStairDirectionStore.set(direction)}
                        >
                            <span aria-hidden="true">{stairArrows[direction]}</span>
                            {$LL.mapEditor.mapLayer.stair.directions[direction]()}
                        </button>
                    {/each}
                </div>
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.stair.width()}</h3>
                <div class="flex gap-2">
                    {#each [1, 2] as const as width (width)}
                        <button
                            type="button"
                            class="px-3 py-1 rounded text-xs {$mapLayerStairWidthStore === width
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={$mapLayerStairWidthStore === width}
                            onclick={() => mapLayerStairWidthStore.set(width)}
                        >
                            {width}
                        </button>
                    {/each}
                </div>
                <InputSwitch
                    id="map-layer-stair-open"
                    label={$LL.mapEditor.mapLayer.stair.openSide()}
                    bind:value={$mapLayerStairOpenStore}
                    margin="mt-0"
                />
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.stairLegend.title()}</h3>
                <ul class="m-0 flex list-none flex-col gap-1 p-0 text-xs opacity-90" data-testid="mapLayerStairLegend">
                    {#each stairLegend as { key, color } (key)}
                        <li class="flex items-center gap-2">
                            <span
                                class="inline-block h-3 w-3 shrink-0 rounded-sm border border-white/40"
                                style="background-color: {color}"
                            ></span>
                            {$LL.mapEditor.mapLayer.stairLegend[key]()}
                        </li>
                    {/each}
                </ul>
            </section>
        {/if}

        {#if $mapLayerModeStore === "door"}
            <section class="flex flex-col gap-1">
                <InputSwitch
                    id="map-layer-glazed-door"
                    label={$LL.mapEditor.mapLayer.glazedDoor()}
                    bind:value={$mapLayerDoorGlazedStore}
                    disabled={!$mapLayerGlazedDoorsAvailableStore}
                    margin="mt-0"
                />
                <p class="m-0 text-xs opacity-70">{$LL.mapEditor.mapLayer.glazedDoorHint()}</p>
            </section>
        {/if}

        {#if usesWall}
            <section class="flex flex-col gap-2">
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.walls()}</h3>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
                    {#each MAP_LAYER_WALL_TINTS as tint (tint)}
                        {@render swatch(
                            $mapLayerWallTintStore === tint,
                            $LL.mapEditor.mapLayer.tints[tint](),
                            $mapLayerWallSwatchesStore[tint],
                            () => mapLayerWallTintStore.set(tint),
                        )}
                    {/each}
                </div>
            </section>
        {/if}

        {#if heightKind}
            <section class="flex flex-col gap-2" data-testid="mapLayerHeight">
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.heights[heightKind]()}</h3>
                <div class="grid {heightKind === 'door' ? 'grid-cols-5' : 'grid-cols-4'} gap-2">
                    {#if heightKind === "door"}
                        <!-- The default of the doors: the height of the wall, two tiles at most. -->
                        <button
                            type="button"
                            class="p-2 rounded text-sm {$mapLayerDoorHeightStore === 'auto'
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={$mapLayerDoorHeightStore === "auto"}
                            title={$LL.mapEditor.mapLayer.doorHeightAutoHint()}
                            data-testid="mapLayerHeight-auto"
                            onclick={() => mapLayerDoorHeightStore.set("auto")}
                        >
                            {$LL.mapEditor.mapLayer.doorHeightAuto()}
                        </button>
                    {/if}
                    {#each MAP_LAYER_WALL_HEIGHTS as height (height)}
                        {@const available = heightsAvailable.includes(height)}
                        <button
                            type="button"
                            disabled={!available}
                            class="p-2 rounded text-sm disabled:opacity-40 {chosenHeight === height
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={chosenHeight === height}
                            title={available
                                ? undefined
                                : heightKind === "selection" && $mapLayerHeightSelectionStore.count === 0
                                  ? $LL.mapEditor.mapLayer.heightNoSelection()
                                  : $LL.mapEditor.mapLayer.heightUnavailable[heightKind]()}
                            data-testid="mapLayerHeight-{height}"
                            onclick={() =>
                                heightKind === "selection"
                                    ? mapLayerHeightRequestStore.set(height)
                                    : heightStore.set(height)}
                        >
                            {height}
                        </button>
                    {/each}
                </div>
            </section>
        {/if}

        {#if usesFloor}
            <section class="flex flex-col gap-2">
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.floors()}</h3>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-2">
                    {#each MAP_LAYER_FLOOR_FAMILIES as family (family)}
                        {@render swatch(
                            $mapLayerFloorFamilyStore === family,
                            $LL.mapEditor.mapLayer.families[family](),
                            $mapLayerFloorSwatchesStore[family],
                            () => mapLayerFloorFamilyStore.set(family),
                        )}
                    {/each}
                </div>
            </section>
        {/if}

        {#if $mapLayerStatusStore}
            <p class="m-0 text-sm text-warning" role="alert">{$LL.mapEditor.mapLayer.status[$mapLayerStatusStore]()}</p>
        {/if}
    {/if}
</div>
