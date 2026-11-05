<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import Popup from "../Modal/Popup.svelte";
    import Button from "../UI/Button.svelte";
    import { modals } from "@wa-modals";

    interface Props {
        isOpen: boolean;
        userName: string;
        confirm: () => void;
    }

    let { isOpen, userName, confirm }: Props = $props();
    let cancelButton: HTMLElement | undefined = $state();

    $effect(() => {
        if (isOpen) cancelButton?.focus({ preventScroll: true });
    });
</script>

<svelte:window
    onkeydown={(event) => {
        if (isOpen && event.key === "Escape") {
            event.preventDefault();
            event.stopImmediatePropagation();
            modals.close();
        }
    }}
/>

<Popup {isOpen}>
    {#snippet title()}
        <h1 class="m-0 text-xl">{$LL.chat.privateMessage.clearHistory()}</h1>
    {/snippet}
    {#snippet content()}
        <p>{$LL.chat.privateMessage.clearHistoryConfirmation({ userName })}</p>
    {/snippet}
    {#snippet action()}
        <Button bind:element={cancelButton} onclick={() => modals.close()}>
            {$LL.chat.privateMessage.cancelDelete()}
        </Button>
        <Button
            variant="danger"
            onclick={() => {
                confirm();
                modals.close();
            }}
        >
            {$LL.chat.privateMessage.confirmDelete()}
        </Button>
    {/snippet}
</Popup>
