<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { IconTrash } from "@wa-icons";

    interface Props {
        name: string;
        disabled: boolean;
        onConfirm: () => void;
    }

    let { name, disabled, onConfirm }: Props = $props();

    // A pattern is shared by every editor of the world and its deletion cannot be undone: ask first, in place.
    let confirming = $state(false);

    function confirm(): void {
        confirming = false;
        onConfirm();
    }
</script>

{#if confirming}
    <span
        class="flex shrink-0 items-center gap-1 text-xs"
        role="group"
        data-testid="mapEditorSelectionPatternConfirmDelete"
    >
        <span>{$LL.mapEditor.selection.deletePatternConfirm()}</span>
        <button
            class="rounded bg-danger px-2 py-1 hover:bg-danger-600 disabled:opacity-50"
            data-testid="mapEditorSelectionPatternDeleteYes"
            {disabled}
            onclick={confirm}
            type="button"
        >
            {$LL.mapEditor.selection.deletePatternYes()}
        </button>
        <button
            class="rounded px-2 py-1 hover:bg-white/10"
            data-testid="mapEditorSelectionPatternDeleteNo"
            onclick={() => (confirming = false)}
            type="button"
        >
            {$LL.mapEditor.selection.deletePatternNo()}
        </button>
    </span>
{:else}
    <button
        class="shrink-0 rounded p-1 hover:bg-white/10 disabled:opacity-50"
        data-testid="mapEditorSelectionPatternDelete"
        aria-label={$LL.mapEditor.selection.deletePattern({ name })}
        {disabled}
        onclick={() => (confirming = true)}
        type="button"
    >
        <IconTrash />
    </button>
{/if}
