<script lang="ts">
    import FloorLevelStack from "../Floors/FloorLevelStack.svelte";
    import { floorLevelName } from "../../Stores/FloorLevelsStore";
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorPlacementLevelStore } from "../../Stores/MapEditorStore";
    import {
        mapLayerBuiltLevelsStore,
        mapLayerLevelStore,
        mapLayerLevelsStore,
        mapLayerPickLevelStore,
    } from "../../Stores/MapLayerStore";
    import { stepLevel, steppableLevels } from "../../Phaser/Game/MapEditor/MapLayer/FloorOperations";
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
    // In "auto", the level last found under the pointer: where the stepping buttons start from.
    let current = $derived(choice === "auto" ? $mapLayerLevelStore : choice);
    // The ground, the floors that have slabs, and the level chosen when it is none of them.
    let chips = $derived(
        [...new Set([0, ...$mapLayerBuiltLevelsStore, ...(choice === "auto" ? [] : [choice])])].sort((a, b) => a - b),
    );

    // The same names as the floors of the game: "Sol", "Étage 1", "Étage 2"…
    const label = (level: number): string => floorLevelName($LL, level, $mapLayerBuiltLevelsStore);

    function choose(level: "auto" | number): void {
        if (forObject) {
            if (level !== "auto") onObjectLevel?.(level);
            return;
        }
        mapLayerPickLevelStore.set(false);
        mapEditorPlacementLevelStore.set(level);
    }

    /** One level up or down: any level, one per tile of wall, with or without slabs. */
    function stepByLevel(delta: 1 | -1): void {
        choose(stepLevel(steppableLevels($mapLayerLevelsStore), current, delta));
    }

    /** To the next floor that has slabs, up or down; the ground under the lowest one. */
    function stepByFloor(delta: 1 | -1): void {
        const built = $mapLayerBuiltLevelsStore;
        const next =
            delta === 1
                ? (built.find((level) => level > current) ?? current)
                : ([...built].reverse().find((level) => level < current) ?? 0);
        choose(next);
    }

    const chipClass = (selected: boolean): string =>
        `px-2 py-1 rounded text-xs ${selected ? "bg-secondary" : "bg-white/10 hover:bg-white/20"}`;
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
            disabled={!$mapLayerBuiltLevelsStore.some((level) => level > current)}
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
    <details class="text-xs">
        <summary class="cursor-pointer opacity-60 hover:opacity-100">
            {$LL.mapEditor.mapLayer.floorLevel.adjust()}
        </summary>
        <div class="mt-2 flex items-center gap-2">
            <button
                type="button"
                class={chipClass(false)}
                title={$LL.mapEditor.mapLayer.floorLevel.levelStepHint()}
                data-testid="floorLevelDown"
                onclick={() => stepByLevel(-1)}>{$LL.mapEditor.mapLayer.floorLevel.levelDown()}</button
            >
            <button
                type="button"
                class={chipClass(false)}
                title={$LL.mapEditor.mapLayer.floorLevel.levelStepHint()}
                data-testid="floorLevelUp"
                onclick={() => stepByLevel(1)}>{$LL.mapEditor.mapLayer.floorLevel.levelUp()}</button
            >
        </div>
    </details>
    {#if $mapLayerPickLevelStore && !forObject}
        <p class="m-0 text-xs opacity-80">{$LL.mapEditor.mapLayer.floorLevel.pickArmed()}</p>
    {/if}
</section>
