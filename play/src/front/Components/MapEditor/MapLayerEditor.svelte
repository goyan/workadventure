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
        mapLayerPickLevelStore,
        mapLayerStairDirectionStore,
        mapLayerStairHeightStore,
        mapLayerStairOpenStore,
        mapLayerStairWidthStore,
    } from "../../Stores/MapLayerStore";
    import {
        FLOOR_WALL_HEIGHTS,
        STAIR_DIRECTIONS,
        floorElevation,
    } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
    import type { MapLayerMode } from "../../Stores/MapLayerStore";
    import {
        IconArrowAutofitHeight,
        IconBrush,
        IconColorPicker,
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

    /** The name of a level: the height of the walls it stands on when it is one of the ground, its altitude otherwise. */
    function levelLabel(level: number): string {
        const height = FLOOR_WALL_HEIGHTS.find((candidate) => floorElevation(candidate) === level);
        return height
            ? $LL.mapEditor.mapLayer.floorLevel.onWall({ height })
            : $LL.mapEditor.mapLayer.floorLevel.other({ pixels: level });
    }

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

<div class="flex flex-col gap-4 text-white" data-testid="mapLayerEditor">
    <h2 class="text-lg font-bold m-0">{$LL.mapEditor.mapLayer.title()}</h2>

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
            {/if}
        </section>
        <p class="m-0 text-sm opacity-80">{$LL.mapEditor.mapLayer.hints[$mapLayerModeStore]()}</p>

        {#if isFloorMode($mapLayerModeStore)}
            <section class="flex flex-col gap-2" data-testid="mapLayerLevel">
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.floorLevel.title()}</h3>
                <div class="flex flex-wrap gap-2">
                    {#each [0, ...$mapLayerLevelsStore] as level (level)}
                        <button
                            type="button"
                            class="px-3 py-1 rounded text-xs {$mapLayerLevelStore === level
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={$mapLayerLevelStore === level}
                            data-testid="mapLayerLevel-{level}"
                            onclick={() => mapLayerLevelStore.set(level)}
                        >
                            {level === 0 ? $LL.mapEditor.mapLayer.floorLevel.ground() : levelLabel(level)}
                        </button>
                    {/each}
                </div>
                <button
                    type="button"
                    class="flex items-center gap-2 px-3 py-1 rounded text-xs self-start {$mapLayerPickLevelStore
                        ? 'bg-secondary'
                        : 'bg-white/10 hover:bg-white/20'}"
                    aria-pressed={$mapLayerPickLevelStore}
                    data-testid="mapLayerPickLevel"
                    onclick={() => mapLayerPickLevelStore.update((armed) => !armed)}
                >
                    <IconColorPicker font-size="16" />
                    {$mapLayerPickLevelStore
                        ? $LL.mapEditor.mapLayer.floorLevel.pickArmed()
                        : $LL.mapEditor.mapLayer.floorLevel.pick()}
                </button>
                <p class="m-0 text-xs opacity-70">{$LL.mapEditor.mapLayer.floorLevel.pickHint()}</p>
            </section>
        {/if}

        {#if $mapLayerModeStore === "stair"}
            <section class="flex flex-col gap-2" data-testid="mapLayerStair">
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
                <h3 class="m-0 text-sm font-bold">{$LL.mapEditor.mapLayer.stair.height()}</h3>
                <div class="flex gap-2">
                    {#each FLOOR_WALL_HEIGHTS as height (height)}
                        <button
                            type="button"
                            class="px-3 py-1 rounded text-xs {$mapLayerStairHeightStore === height
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            aria-pressed={$mapLayerStairHeightStore === height}
                            onclick={() => mapLayerStairHeightStore.set(height)}
                        >
                            {height}
                        </button>
                    {/each}
                </div>
                <InputSwitch
                    id="map-layer-stair-open"
                    label={$LL.mapEditor.mapLayer.stair.openSide()}
                    bind:value={$mapLayerStairOpenStore}
                    margin="mt-0"
                />
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
