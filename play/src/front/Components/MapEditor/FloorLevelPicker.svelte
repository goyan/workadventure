<script lang="ts">
    import FloorLevelStack from "../Floors/FloorLevelStack.svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorPlacementLevelStore } from "../../Stores/MapEditorStore";
    import {
        mapLayerBuiltLevelsStore,
        mapLayerLevelStore,
        mapLayerLevelsStore,
        mapLayerPickLevelStore,
    } from "../../Stores/MapLayerStore";
    import { steppableLevels } from "../../Phaser/Game/MapEditor/MapLayer/FloorOperations";
    import { floorLevelTiles } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
    import { IconChevronDown, IconChevronUp, IconColorPicker } from "@wa-icons";

    interface Props {
        /**
         * For an object selected in the editor: its level, and what moves it to another one. The picker then shows the
         * level of that object instead of the one new things are placed on, without "auto" nor the pipette.
         */
        objectLevel?: number;
        onObjectLevel?: (level: number) => void;
        /** The thing selected is an area, not an object: only the title changes. */
        forArea?: boolean;
    }
    let { objectLevel, onObjectLevel, forArea = false }: Props = $props();
    let forObject = $derived(objectLevel !== undefined && onObjectLevel !== undefined);

    // The level the map editor works on, the same for the map tool and the objects: "auto" follows the floor drawn
    // under the pointer, a number is that level (0: the ground), whatever is drawn there.
    let choice = $derived<"auto" | number>(objectLevel ?? $mapEditorPlacementLevelStore);
    // In "auto", the level last found under the pointer: where the arrows start from.
    let current = $derived(choice === "auto" ? $mapLayerLevelStore : choice);
    // Every level one can build on: the ground, the levels offered (with or without slabs: the one of a bridge is
    // chosen before its deck is laid), the floors that have slabs, and the level chosen when it is none of them.
    let chips = $derived(
        [
            ...new Set([
                0,
                ...$mapLayerLevelsStore,
                ...$mapLayerBuiltLevelsStore,
                ...(choice === "auto" ? [] : [choice]),
            ]),
        ].sort((a, b) => a - b),
    );

    // A name that does not change as floors are built: the height of the level ("Niveau 2"), then its name in the
    // game when it has slabs ("Étage 1").
    function label(level: number): string {
        if (level <= 0) return $LL.mapEditor.mapLayer.floorLevel.ground();
        const name = $LL.mapEditor.mapLayer.floorLevel.level({ height: floorLevelTiles(level) });
        const rank = [...$mapLayerBuiltLevelsStore].sort((a, b) => a - b).indexOf(level) + 1;
        return rank > 0 ? `${name} · ${$LL.mapEditor.mapLayer.floorLevel.storey({ rank })}` : name;
    }

    function choose(level: "auto" | number): void {
        if (forObject) {
            if (level !== "auto") onObjectLevel?.(level);
            return;
        }
        mapLayerPickLevelStore.set(false);
        mapEditorPlacementLevelStore.set(level);
    }

    // Where the arrows go: the levels of the list and, above the walls of 2 tiles, one level per tile of wall, so that
    // a floor or a bridge can be started where nothing is built yet.
    let steps = $derived([...new Set([...chips, ...steppableLevels($mapLayerLevelsStore)])].sort((a, b) => a - b));

    /** To the next level up or down, with or without slabs; the ground under the lowest one. */
    function stepByFloor(delta: 1 | -1): void {
        const next =
            delta === 1
                ? (steps.find((level) => level > current) ?? current)
                : ([...steps].reverse().find((level) => level < current) ?? 0);
        choose(next);
    }
</script>

<section class="level-bar flex shrink-0 flex-col gap-2 text-white" data-testid="floorLevelPicker">
    {#if forObject}
        <h3 class="m-0 text-xs font-bold opacity-80">
            {forArea ? $LL.mapEditor.mapLayer.floorLevel.areaTitle() : $LL.mapEditor.mapLayer.floorLevel.objectTitle()}
        </h3>
    {/if}
    <div class="flex items-center gap-2">
        <button
            type="button"
            class="build-slot sm"
            aria-label={$LL.mapEditor.mapLayer.floorLevel.floorDown()}
            disabled={current === 0}
            data-testid="floorDown"
            onclick={() => stepByFloor(-1)}
        >
            <IconChevronDown font-size="18" />
        </button>
        <div class="min-w-0 flex-1" data-testid="floorLevelSelect">
            <FloorLevelStack
                stack={{
                    levels: [...chips].reverse().map((elevation) => ({ elevation, name: label(elevation) })),
                    current,
                    viewed: choice === "auto" ? undefined : choice,
                }}
                onSelectFloor={(level) => choose(level ?? "auto")}
                allowAuto={!forObject}
                fullWidth
            />
        </div>
        <button
            type="button"
            class="build-slot sm"
            aria-label={$LL.mapEditor.mapLayer.floorLevel.floorUp()}
            disabled={!steps.some((level) => level > current)}
            data-testid="floorUp"
            onclick={() => stepByFloor(1)}
        >
            <IconChevronUp font-size="18" />
        </button>
        {#if !forObject}
            <button
                type="button"
                class="build-slot sm"
                aria-pressed={$mapLayerPickLevelStore}
                aria-label={$LL.mapEditor.mapLayer.floorLevel.pick()}
                data-tip={$LL.mapEditor.mapLayer.floorLevel.pickHint()}
                data-testid="floorLevelPick"
                onclick={() => mapLayerPickLevelStore.update((armed) => !armed)}
            >
                <IconColorPicker font-size="16" />
            </button>
        {/if}
    </div>
    {#if $mapLayerPickLevelStore && !forObject}
        <p class="m-0 text-xs opacity-80">{$LL.mapEditor.mapLayer.floorLevel.pickArmed()}</p>
    {/if}
</section>
