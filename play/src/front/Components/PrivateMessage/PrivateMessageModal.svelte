<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { privateMessageHistoryStore, recordPrivateMessage } from "../../Stores/PrivateMessageStore";
    import { inputFormFocusStore } from "../../Stores/UserInputStore";
    import { blackListManager } from "../../WebRtc/BlackListManager";
    import Popup from "../Modal/Popup.svelte";
    import Button from "../UI/Button.svelte";

    interface Props {
        isOpen: boolean;
        userUuid: string;
        userName: string;
        send: (text: string) => Promise<void>;
    }

    let { isOpen, userUuid, userName, send }: Props = $props();
    let text = $state("");
    let sending = $state(false);
    let failed = $state(false);
    let messageInput: HTMLTextAreaElement | undefined = $state();
    const lifetime = new AbortController();
    const messages = $derived($privateMessageHistoryStore.filter((message) => message.peerUuid === userUuid));

    $effect(() => {
        if (isOpen && !sending) messageInput?.focus({ preventScroll: true });
    });

    onDestroy(() => {
        lifetime.abort();
        inputFormFocusStore.set(false);
    });

    function submit(): Promise<void> {
        const message = text.trim();
        if (!message || sending) return Promise.resolve();
        sending = true;
        failed = false;
        if (blackListManager.isBlackListed(userUuid)) {
            failed = true;
            sending = false;
            return Promise.resolve();
        }
        return send(message)
            .then(() => {
                if (lifetime.signal.aborted) return;
                recordPrivateMessage({ peerUuid: userUuid, peerName: userName, text: message, incoming: false });
                text = "";
            })
            .catch(() => {
                if (!lifetime.signal.aborted) failed = true;
            })
            .finally(() => {
                if (!lifetime.signal.aborted) sending = false;
            });
    }
</script>

<Popup {isOpen} withAction={false}>
    {#snippet title()}
        <h1 class="m-0 text-xl">{$LL.chat.privateMessage.label()} · {userName}</h1>
    {/snippet}
    {#snippet content()}
        <div class="flex flex-col gap-3 w-full">
            <div class="max-h-64 overflow-y-auto flex flex-col gap-2" aria-live="polite">
                {#each messages as message (message.id)}
                    <div class="rounded bg-white/10 p-3">
                        <strong>{message.incoming ? message.peerName : $LL.chat.you()}</strong>
                        <p class="m-0 whitespace-pre-wrap break-words">{message.text}</p>
                    </div>
                {/each}
            </div>
            <form
                class="flex flex-col gap-2"
                onsubmit={async (event) => {
                    event.preventDefault();
                    await submit();
                }}
            >
                <label for="private-message-text">{$LL.chat.privateMessage.label()}</label>
                <textarea
                    id="private-message-text"
                    class="input-text w-full min-h-20"
                    maxlength={500}
                    bind:this={messageInput}
                    bind:value={text}
                    placeholder={$LL.chat.enter()}
                    disabled={sending}
                    onfocus={() => inputFormFocusStore.set(true)}
                    onblur={() => inputFormFocusStore.set(false)}
                    onkeydown={async (event) => {
                        event.stopPropagation();
                        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                            event.preventDefault();
                            await submit();
                        }
                    }}
                ></textarea>
                {#if failed}
                    <p role="alert" class="m-0 text-red-300">{$LL.chat.privateMessage.unavailable()}</p>
                {/if}
                <Button type="submit" disabled={sending || !text.trim()}>
                    {sending ? $LL.chat.privateMessage.sending() : $LL.chat.userList.sendMessage()}
                </Button>
            </form>
        </div>
    {/snippet}
</Popup>
