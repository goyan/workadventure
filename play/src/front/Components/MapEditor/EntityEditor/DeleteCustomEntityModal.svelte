<script lang="ts">
    import Popup from "../../Modal/Popup.svelte";
    import Button from "../../UI/Button.svelte";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { modals } from "@wa-modals";

    interface Props {
        isOpen: boolean;
        /** Name of the imported image, as shown in the library. */
        name: string;
        /** Copies placed on the current map: they are removed with it. The other maps cannot be counted here. */
        placedCount: number;
        onConfirm: () => void;
    }

    let { isOpen, name, placedCount, onConfirm }: Props = $props();
    // The deletion cannot be undone: a second click while the dialog closes must not send it twice.
    let confirmed = false;

    function confirm(): void {
        if (!isOpen || confirmed) return;
        confirmed = true;
        modals.close();
        onConfirm();
    }
</script>

<!-- Captured, then stopped: Escape also drops the selection in the map editor, which must stay as it was. -->
<svelte:window
    onkeydowncapture={(event) => {
        if (!isOpen || event.key !== "Escape") return;
        event.stopPropagation();
        modals.close();
    }}
/>

<Popup {isOpen}>
    {#snippet title()}
        <h1>{$LL.mapEditor.entityEditor.deleteCustomEntity.title({ name })}</h1>
    {/snippet}
    {#snippet content()}
        <p data-testid="deleteCustomEntityDescription">
            {$LL.mapEditor.entityEditor.deleteCustomEntity.description({ count: placedCount })}
        </p>
    {/snippet}
    {#snippet action()}
        <Button class="flex-1" onclick={() => modals.close()}>{$LL.actionbar.cancel()}</Button>
        <Button variant="danger" class="flex-1" dataTestId="confirmDeleteCustomEntity" onclick={confirm}>
            {$LL.mapEditor.entityEditor.deleteCustomEntity.confirm()}
        </Button>
    {/snippet}
</Popup>
