<script lang="ts">
    import * as Sentry from "@sentry/svelte";
    import { asError } from "catch-unknown";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { mapEditorSelectionStore } from "../../Stores/MapEditorSelectionStore";
    import { mapEditorSelectedEntityPrefabStore } from "../../Stores/MapEditorStore";
    import EntityEditorPicker from "./EntityEditor/EntityEditorPicker.svelte";

    const selectionTool = gameManager.getCurrentGameScene().getMapEditorModeManager().getSelectionEditorTool();

    let hasSelection = $derived($mapEditorSelectionStore.entityCount + $mapEditorSelectionStore.areaCount > 0);

    function copySelection(): void {
        selectionTool.copySelection();
    }

    function pasteSelection(): void {
        selectionTool.pasteSelection();
    }

    function moveSelection(): void {
        selectionTool.moveSelection();
    }

    function cancelSelectionMode(): void {
        selectionTool.handleKeyDownEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }

    async function deleteSelection(): Promise<void> {
        try {
            await selectionTool.deleteSelection();
        } catch (error: unknown) {
            Sentry.captureException(asError(error), {
                extra: { operation: "Delete map editor selection" },
            });
        }
    }

    async function fillSelection(): Promise<void> {
        try {
            await selectionTool.fillSelection();
        } catch (error: unknown) {
            Sentry.captureException(asError(error), {
                extra: { operation: "Fill map editor selection" },
            });
        }
    }
</script>

<section class="flex h-full flex-col gap-3 overflow-y-auto" data-testid="mapEditorSelectionPanel">
    <header>
        <h2 class="text-lg font-semibold">{$LL.mapEditor.selection.title()}</h2>
        {#if $mapEditorSelectionStore.mode === "select"}
            <p class="text-sm">{$LL.mapEditor.selection.drawingInstruction()}</p>
        {/if}
    </header>

    <div class="text-sm" aria-live="polite" data-testid="mapEditorSelectionCounts">
        <p>{$LL.mapEditor.selection.objectCount({ count: $mapEditorSelectionStore.entityCount })}</p>
        <p>{$LL.mapEditor.selection.areaCount({ count: $mapEditorSelectionStore.areaCount })}</p>
    </div>

    {#if $mapEditorSelectionStore.mode === "move" || $mapEditorSelectionStore.mode === "paste"}
        <div class="flex items-center justify-between gap-2">
            <p class="text-sm" aria-live="polite">{$LL.mapEditor.selection.placeInstruction()}</p>
            <button
                class="shrink-0 rounded px-2 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                data-testid="mapEditorSelectionCancel"
                aria-label={$LL.mapEditor.selection.cancel()}
                disabled={$mapEditorSelectionStore.busy}
                onclick={cancelSelectionMode}
                type="button"
            >
                {$LL.mapEditor.selection.cancel()}
            </button>
        </div>
    {/if}

    {#if $mapEditorSelectionStore.error === "blocked"}
        <p class="text-sm text-red-400" role="alert" data-testid="mapEditorSelectionBlocked">
            {$LL.mapEditor.selection.blocked()}
        </p>
    {:else if $mapEditorSelectionStore.error === "failed"}
        <p class="text-sm text-red-400" role="alert" data-testid="mapEditorSelectionFailed">
            {$LL.mapEditor.selection.failed()}
        </p>
    {/if}

    <div class="grid grid-cols-2 gap-2">
        <button
            class="rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
            data-testid="mapEditorSelectionCopy"
            aria-label={$LL.mapEditor.selection.copy()}
            disabled={!hasSelection || $mapEditorSelectionStore.busy}
            onclick={copySelection}
            type="button"
        >
            {$LL.mapEditor.selection.copy()}
        </button>
        <button
            class="rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
            data-testid="mapEditorSelectionPaste"
            aria-label={$LL.mapEditor.selection.paste()}
            disabled={!$mapEditorSelectionStore.hasClipboard || $mapEditorSelectionStore.busy}
            onclick={pasteSelection}
            type="button"
        >
            {$LL.mapEditor.selection.paste()}
        </button>
        <button
            class="rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
            data-testid="mapEditorSelectionMove"
            aria-label={$LL.mapEditor.selection.move()}
            disabled={!hasSelection || $mapEditorSelectionStore.busy}
            onclick={moveSelection}
            type="button"
        >
            {$LL.mapEditor.selection.move()}
        </button>
        <button
            class="rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
            data-testid="mapEditorSelectionDelete"
            aria-label={$LL.mapEditor.selection.delete()}
            disabled={!hasSelection || $mapEditorSelectionStore.busy}
            onclick={deleteSelection}
            type="button"
        >
            {$LL.mapEditor.selection.delete()}
        </button>
        <button
            class="col-span-2 rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
            data-testid="mapEditorSelectionFill"
            aria-label={$LL.mapEditor.selection.fill()}
            disabled={!$mapEditorSelectionStore.hasRectangle ||
                !$mapEditorSelectedEntityPrefabStore ||
                $mapEditorSelectionStore.busy}
            onclick={fillSelection}
            type="button"
        >
            {$LL.mapEditor.selection.fill()}
        </button>
    </div>

    <details class="rounded bg-contrast/50 p-2">
        <summary class="cursor-pointer font-medium">{$LL.mapEditor.selection.tileToFillWith()}</summary>
        <div class="mt-2 max-h-64 overflow-y-auto">
            <EntityEditorPicker />
        </div>
    </details>
</section>
