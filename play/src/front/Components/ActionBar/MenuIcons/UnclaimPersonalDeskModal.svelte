<script lang="ts">
    import Popup from "../../Modal/Popup.svelte";
    import Button from "../../UI/Button.svelte";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { modals } from "@wa-modals";

    interface Props {
        isOpen: boolean;
        deskName: string;
        onConfirm: () => Promise<void>;
    }

    let { isOpen, deskName, onConfirm }: Props = $props();
    let confirmed = false;

    function confirm(): void {
        if (!isOpen || confirmed) return;
        confirmed = true;
        modals.close();
        onConfirm().catch((error) => console.error("Error while confirming personal desk release", error));
    }
</script>

<svelte:window
    onkeydown={(event) => {
        if (isOpen && event.key === "Escape") modals.close();
    }}
/>

<Popup {isOpen}>
    {#snippet title()}
        <h1>{$LL.actionbar.personalDesk.unclaim()}</h1>
    {/snippet}
    {#snippet content()}
        <p>{$LL.actionbar.personalDesk.unclaimConfirmation({ name: deskName })}</p>
    {/snippet}
    {#snippet action()}
        <Button class="flex-1" onclick={() => modals.close()}>{$LL.actionbar.cancel()}</Button>
        <Button variant="secondary" class="flex-1" onclick={confirm}>{$LL.actionbar.personalDesk.unclaim()}</Button>
    {/snippet}
</Popup>
