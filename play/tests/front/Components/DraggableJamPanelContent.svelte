<script lang="ts">
    import type { Readable } from "svelte/store";
    import DraggableJamPanel from "../../../src/front/Components/ListeningZone/DraggableJamPanel.svelte";

    interface Props {
        sidePanelOpen: Readable<boolean>;
        onAction: () => void;
        onLayout: (layout: { height: number; moved: boolean }) => void;
    }

    let { sidePanelOpen, onAction, onLayout }: Props = $props();
</script>

<DraggableJamPanel anchorTop={$sidePanelOpen ? 100 : 0} {onLayout}>
    {#snippet children(onDragStart, onDragKeydown)}
        <button type="button" onpointerdown={onDragStart} onkeydown={onDragKeydown} data-testid="drag-handle"
            >Jam</button
        >
        <button type="button" onclick={onAction} data-testid="jam-action">Join</button>
    {/snippet}
</DraggableJamPanel>
