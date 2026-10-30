<script lang="ts">
    import DrowAreaGif from "../../images/draw-area.gif";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { mapEditorAreaEraserStore } from "../../../Stores/MapEditorStore";
    import { IconEraser } from "../../Icons";
</script>

<div class="area-name-container">
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
        <img
            draggable="false"
            src={DrowAreaGif}
            class="w-full"
            alt={$LL.mapEditor.areaEditorInstructions.description()}
        />
    {/if}
</div>

<style>
</style>
