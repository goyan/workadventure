<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorPlacementLevelStore } from "../../Stores/MapEditorStore";
    import {
        mapLayerBuiltLevelsStore,
        mapLayerLevelStore,
        mapLayerLevelsStore,
        mapLayerPickLevelStore,
    } from "../../Stores/MapLayerStore";
    import { floorLevelTiles } from "../../Phaser/Game/MapEditor/MapLayer/MapLayerFloors";
    import { stepLevel, steppableLevels } from "../../Phaser/Game/MapEditor/MapLayer/FloorOperations";
    import { IconColorPicker } from "@wa-icons";

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

    function label(level: number): string {
        if (level === 0) return $LL.mapEditor.mapLayer.floorLevel.ground();
        const name = $LL.mapEditor.mapLayer.floorLevel.level({ height: floorLevelTiles(level) });
        const rank = $mapLayerBuiltLevelsStore.indexOf(level) + 1;
        return rank > 0 ? `${name} · ${$LL.mapEditor.mapLayer.floorLevel.built({ rank })}` : name;
    }

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

<section class="flex flex-col gap-2 text-white" data-testid="floorLevelPicker">
    <h3 class="m-0 text-sm font-bold">
        {forObject
            ? forArea
                ? $LL.mapEditor.mapLayer.floorLevel.areaTitle()
                : $LL.mapEditor.mapLayer.floorLevel.objectTitle()
            : $LL.mapEditor.mapLayer.floorLevel.title()}
    </h3>
    <div class="flex flex-wrap items-center gap-2">
        {#if !forObject}
            <button
                type="button"
                class={chipClass(choice === "auto")}
                aria-pressed={choice === "auto"}
                title={$LL.mapEditor.mapLayer.floorLevel.autoHint()}
                data-testid="floorLevel-auto"
                onclick={() => choose("auto")}
            >
                {$LL.mapEditor.mapLayer.floorLevel.auto()}
            </button>
            <button
                type="button"
                class={chipClass($mapLayerPickLevelStore)}
                aria-pressed={$mapLayerPickLevelStore}
                aria-label={$LL.mapEditor.mapLayer.floorLevel.pick()}
                title={`${$LL.mapEditor.mapLayer.floorLevel.pick()}. ${$LL.mapEditor.mapLayer.floorLevel.pickHint()}`}
                data-testid="floorLevelPick"
                onclick={() => mapLayerPickLevelStore.update((armed) => !armed)}
            >
                <IconColorPicker font-size="16" />
            </button>
        {/if}
        {#each chips as level (level)}
            <button
                type="button"
                class={chipClass(choice === level)}
                aria-pressed={choice === level}
                title={level === 0
                    ? $LL.mapEditor.mapLayer.floorLevel.groundHint()
                    : $LL.mapEditor.mapLayer.floorLevel.levelHint({ height: floorLevelTiles(level) })}
                data-testid="floorLevel-{level}"
                onclick={() => choose(level)}
            >
                {label(level)}
            </button>
        {/each}
    </div>
    <div class="flex flex-wrap items-center gap-2">
        <button
            type="button"
            class={chipClass(false)}
            title={$LL.mapEditor.mapLayer.floorLevel.levelStepHint()}
            data-testid="floorLevelDown"
            onclick={() => stepByLevel(-1)}
        >
            {$LL.mapEditor.mapLayer.floorLevel.levelDown()}
        </button>
        <button
            type="button"
            class={chipClass(false)}
            title={$LL.mapEditor.mapLayer.floorLevel.levelStepHint()}
            data-testid="floorLevelUp"
            onclick={() => stepByLevel(1)}
        >
            {$LL.mapEditor.mapLayer.floorLevel.levelUp()}
        </button>
        <button
            type="button"
            class={chipClass(false)}
            title={$LL.mapEditor.mapLayer.floorLevel.floorStepHint()}
            data-testid="floorDown"
            onclick={() => stepByFloor(-1)}
        >
            {$LL.mapEditor.mapLayer.floorLevel.floorDown()}
        </button>
        <button
            type="button"
            class={chipClass(false)}
            title={$LL.mapEditor.mapLayer.floorLevel.floorStepHint()}
            data-testid="floorUp"
            onclick={() => stepByFloor(1)}
        >
            {$LL.mapEditor.mapLayer.floorLevel.floorUp()}
        </button>
        {#if choice === "auto" && current > 0}
            <span class="text-xs opacity-70" data-testid="floorLevelCurrent">{label(current)}</span>
        {/if}
    </div>
    {#if $mapLayerPickLevelStore && !forObject}
        <p class="m-0 text-xs opacity-80">{$LL.mapEditor.mapLayer.floorLevel.pickArmed()}</p>
    {/if}
</section>
