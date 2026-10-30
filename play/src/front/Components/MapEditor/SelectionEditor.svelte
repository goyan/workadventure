<script lang="ts">
    import { onMount } from "svelte";
    import * as Sentry from "@sentry/svelte";
    import { asError } from "catch-unknown";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { mapEditorSelectionStore } from "../../Stores/MapEditorSelectionStore";
    import { mapEditorPatternStore } from "../../Stores/MapEditorPatternStore";
    import { refreshMapPatterns, removeMapPattern } from "../../Phaser/Game/MapEditor/MapPatternActions";
    import { MAP_PATTERN_MAX_NAME_LENGTH } from "../../../common/MapPattern";
    import type { MapPatternSummary } from "../../../common/MapPattern";
    import { mapEditorSelectedEntityPrefabStore } from "../../Stores/MapEditorStore";
    import EntityEditorPicker from "./EntityEditor/EntityEditorPicker.svelte";
    import { IconCheck, IconTrash, IconX } from "@wa-icons";

    const selectionTool = gameManager.getCurrentGameScene().getMapEditorModeManager().getSelectionEditorTool();

    let hasSelection = $derived($mapEditorSelectionStore.entityCount + $mapEditorSelectionStore.areaCount > 0);

    let isNamingPattern = $state(false);
    let patternName = $state("");
    let canSavePattern = $derived(patternName.trim().length > 0 && !$mapEditorSelectionStore.busy);

    const patternErrorMessages = $derived({
        unavailable: $LL.mapEditor.selection.patternsUnavailable(),
        forbidden: $LL.mapEditor.selection.patternsForbidden(),
        quota: $LL.mapEditor.selection.patternsQuota(),
        invalid: $LL.mapEditor.selection.patternsInvalid(),
        "not-found": $LL.mapEditor.selection.patternsNotFound(),
        "rate-limit": $LL.mapEditor.selection.patternsRateLimit(),
    });

    onMount(() => {
        refreshMapPatterns(gameManager.currentStartedRoom.href).catch((error: unknown) => {
            Sentry.captureException(asError(error), { extra: { operation: "Refresh map editor patterns" } });
        });
    });

    function startNamingPattern(): void {
        patternName = "";
        isNamingPattern = true;
    }

    function stopNamingPattern(): void {
        isNamingPattern = false;
        patternName = "";
    }

    async function savePattern(): Promise<void> {
        const name = patternName.trim();
        if (name.length === 0) {
            return;
        }
        try {
            // Closed as soon as the pattern exists, even if the list refresh fails: a second click would duplicate it.
            if (await selectionTool.saveSelectionAsPattern(name)) {
                stopNamingPattern();
            }
        } catch (error: unknown) {
            Sentry.captureException(asError(error), { extra: { operation: "Save map editor pattern" } });
        }
    }

    // Enter submits the form; Escape closes the field without clearing the map selection.
    function handlePatternNameKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            stopNamingPattern();
        }
    }

    async function pastePattern(pattern: MapPatternSummary): Promise<void> {
        try {
            await selectionTool.pasteFromPattern(pattern.id);
        } catch (error: unknown) {
            Sentry.captureException(asError(error), { extra: { operation: "Paste map editor pattern" } });
        }
    }

    async function deletePattern(pattern: MapPatternSummary): Promise<void> {
        try {
            await removeMapPattern(gameManager.currentStartedRoom.href, pattern.id);
        } catch (error: unknown) {
            Sentry.captureException(asError(error), { extra: { operation: "Delete map editor pattern" } });
        }
    }

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
        {#if !isNamingPattern}
            <button
                class="col-span-2 rounded bg-secondary px-3 py-2 text-white hover:bg-secondary-600 disabled:opacity-50"
                data-testid="mapEditorSelectionSavePattern"
                aria-label={$LL.mapEditor.selection.saveAsPattern()}
                disabled={!hasSelection || $mapEditorSelectionStore.busy}
                onclick={startNamingPattern}
                type="button"
            >
                {$LL.mapEditor.selection.saveAsPattern()}
            </button>
        {/if}
    </div>

    {#if isNamingPattern}
        <form
            class="flex items-center gap-2"
            data-testid="mapEditorSelectionPatternForm"
            onsubmit={(event) => {
                event.preventDefault();
                savePattern().catch(() => undefined);
            }}
        >
            <input
                class="min-w-0 flex-1 rounded bg-contrast/50 px-2 py-1 text-sm text-white"
                data-testid="mapEditorSelectionPatternName"
                aria-label={$LL.mapEditor.selection.patternNameLabel()}
                placeholder={$LL.mapEditor.selection.patternNamePlaceholder()}
                maxlength={MAP_PATTERN_MAX_NAME_LENGTH}
                bind:value={patternName}
                onkeydown={handlePatternNameKeydown}
                type="text"
            />
            <button
                class="shrink-0 rounded p-1 hover:bg-white/10 disabled:opacity-50"
                data-testid="mapEditorSelectionPatternConfirm"
                aria-label={$LL.mapEditor.selection.savePatternConfirm()}
                disabled={!canSavePattern}
                type="submit"
            >
                <IconCheck />
            </button>
            <button
                class="shrink-0 rounded p-1 hover:bg-white/10"
                data-testid="mapEditorSelectionPatternCancel"
                aria-label={$LL.mapEditor.selection.cancel()}
                onclick={stopNamingPattern}
                type="button"
            >
                <IconX />
            </button>
        </form>
    {/if}

    <details class="rounded bg-contrast/50 p-2">
        <summary class="cursor-pointer font-medium">{$LL.mapEditor.selection.tileToFillWith()}</summary>
        <div class="mt-2 max-h-64 overflow-y-auto">
            <EntityEditorPicker />
        </div>
    </details>

    <div class="rounded bg-contrast/50 p-2" data-testid="mapEditorSelectionPatterns">
        <h3 class="font-medium">{$LL.mapEditor.selection.patternsTitle()}</h3>
        <p class="mt-1 text-xs opacity-75">{$LL.mapEditor.selection.patternsDescription()}</p>

        {#if $mapEditorPatternStore.error}
            <p class="mt-2 text-sm text-red-400" role="alert" data-testid="mapEditorSelectionPatternsError">
                {patternErrorMessages[$mapEditorPatternStore.error]}
            </p>
        {/if}
        {#if $mapEditorPatternStore.ignoredCount > 0}
            <p class="mt-2 text-sm text-yellow-400" role="status" data-testid="mapEditorSelectionPatternsIgnored">
                {$LL.mapEditor.selection.patternIgnored({ count: $mapEditorPatternStore.ignoredCount })}
            </p>
        {/if}

        {#if $mapEditorPatternStore.loading && $mapEditorPatternStore.patterns.length === 0}
            <p class="mt-2 text-sm" aria-live="polite">{$LL.mapEditor.selection.patternsLoading()}</p>
        {:else if $mapEditorPatternStore.patterns.length === 0 && !$mapEditorPatternStore.error}
            <p class="mt-2 text-sm" data-testid="mapEditorSelectionPatternsEmpty">
                {$LL.mapEditor.selection.patternsEmpty()}
            </p>
        {:else}
            <ul class="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
                {#each $mapEditorPatternStore.patterns as pattern (pattern.id)}
                    <li class="flex items-center gap-1" data-testid="mapEditorSelectionPattern">
                        <button
                            class="min-w-0 flex-1 rounded px-2 py-1 text-left hover:bg-white/10 disabled:opacity-50"
                            data-testid="mapEditorSelectionPatternPaste"
                            aria-label={$LL.mapEditor.selection.pastePattern({ name: pattern.name })}
                            disabled={$mapEditorSelectionStore.busy}
                            onclick={() => pastePattern(pattern)}
                            type="button"
                        >
                            <span class="block truncate text-sm font-medium">{pattern.name}</span>
                            <span class="block text-xs opacity-75">
                                {$LL.mapEditor.selection.patternContent({
                                    entityCount: pattern.entityCount,
                                    areaCount: pattern.areaCount,
                                })}
                            </span>
                        </button>
                        <button
                            class="shrink-0 rounded p-1 hover:bg-white/10 disabled:opacity-50"
                            data-testid="mapEditorSelectionPatternDelete"
                            aria-label={$LL.mapEditor.selection.deletePattern({ name: pattern.name })}
                            disabled={$mapEditorSelectionStore.busy}
                            onclick={() => deletePattern(pattern)}
                            type="button"
                        >
                            <IconTrash />
                        </button>
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
</section>
