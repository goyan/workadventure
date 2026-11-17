<script lang="ts">
    import { LL } from "../../../../i18n/i18n-svelte";
    import { mapEditorAreaEraserStore } from "../../../Stores/MapEditorStore";
    import { IconEraser } from "../../Icons";
    import FloorLevelPicker from "../FloorLevelPicker.svelte";
    import { mapLayerBuiltLevelsStore } from "../../../Stores/MapLayerStore";
</script>

<div class="area-name-container">
    {#if $mapLayerBuiltLevelsStore.length > 0}
        <!-- The floor the areas are drawn and edited on, shared with the map tool and the objects. -->
        <div class="mb-3">
            <FloorLevelPicker />
        </div>
    {/if}
    <button
        type="button"
        class="flex flex-row items-center gap-2 p-2 mb-2 rounded text-sm {$mapEditorAreaEraserStore
            ? 'bg-danger'
            : 'bg-white/10 hover:bg-white/20'}"
        data-testid="areaEraserButton"
        aria-pressed={$mapEditorAreaEraserStore}
        onclick={() => mapEditorAreaEraserStore.update((active) => !active)}
    >
        <IconEraser font-size="18" />
        <span>{$LL.mapEditor.areaEditor.eraser()}</span>
    </button>
    {#if $mapEditorAreaEraserStore}
        <p class="text-sm opacity-80">{$LL.mapEditor.areaEditor.eraserHint()}</p>
    {:else}
        <h3>{$LL.mapEditor.areaEditorInstructions.title()}</h3>
        <p>{$LL.mapEditor.areaEditorInstructions.description()}</p>
        <ul class="list-disc pl-5 text-sm opacity-80">
            <li>{$LL.mapEditor.areaEditorInstructions.create()}</li>
            <li>{$LL.mapEditor.areaEditorInstructions.open()}</li>
            <li>{$LL.mapEditor.areaEditorInstructions.remove()}</li>
            <li>{$LL.mapEditor.areaEditorInstructions.duplicate()}</li>
        </ul>
    {/if}
</div>

<style>
</style>
