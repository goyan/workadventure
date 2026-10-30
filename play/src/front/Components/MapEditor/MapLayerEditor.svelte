<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        MAP_LAYER_FLOOR_FAMILIES,
        MAP_LAYER_WALL_TINTS,
    } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
    import {
        mapLayerCatalogAvailableStore,
        mapLayerFloorFamilyStore,
        mapLayerFloorSwatchesStore,
        mapLayerModeStore,
        mapLayerStatusStore,
        mapLayerWallSwatchesStore,
        mapLayerWallTintStore,
    } from "../../Stores/MapLayerStore";
    import type { MapLayerMode } from "../../Stores/MapLayerStore";
    import { IconBrush, IconBucket, IconEraser, IconHome, IconRectangle, IconWall } from "@wa-icons";

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

    let usesFloor = $derived($mapLayerModeStore !== "wall" && $mapLayerModeStore !== "erase");
    let usesWall = $derived($mapLayerModeStore === "wall" || $mapLayerModeStore === "room");
</script>

{#snippet modeButton(mode: MapLayerMode, Icon: typeof IconWall)}
    <button
        type="button"
        class="flex flex-col items-center gap-1 p-2 rounded text-xs {$mapLayerModeStore === mode
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
        <p class="m-0 text-sm opacity-80">{$LL.mapEditor.mapLayer.hints[$mapLayerModeStore]()}</p>

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
