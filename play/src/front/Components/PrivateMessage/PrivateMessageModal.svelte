<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        getPrivateMessageDeleter,
        getPrivateMessageRecorder,
        privateMessageHistoryStore,
    } from "../../Stores/PrivateMessageStore";
    import { inputFormFocusStore } from "../../Stores/UserInputStore";
    import { blackListManager } from "../../WebRtc/BlackListManager";
    import Popup from "../Modal/Popup.svelte";
    import Button from "../UI/Button.svelte";
    import PrivateMessageHistoryConfirmation from "./PrivateMessageHistoryConfirmation.svelte";
    import { IconX } from "@wa-icons";
    import { modals } from "@wa-modals";

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
    let messageHistory: HTMLDivElement | undefined = $state();
    let followLatest = true;
    let lastPeerUuid: string | undefined;
    let lastMessageId: number | undefined;
    const lifetime = new AbortController();
    const messages = $derived($privateMessageHistoryStore.filter((message) => message.peerUuid === userUuid));

    $effect(() => {
        if (isOpen && !sending) messageInput?.focus({ preventScroll: true });
    });

    $effect(() => {
        const latest = messages.at(-1);
        if (!isOpen || !messageHistory) {
            lastPeerUuid = undefined;
            lastMessageId = undefined;
            followLatest = true;
            return;
        }
        const openingConversation = lastPeerUuid !== userUuid;
        const newMessage = latest?.id !== lastMessageId;
        lastPeerUuid = userUuid;
        lastMessageId = latest?.id;
        if (openingConversation || (newMessage && (!latest?.incoming || followLatest))) {
            messageHistory.scrollTop = messageHistory.scrollHeight;
            followLatest = true;
        }
    });

    function requestClearHistory(): void {
        if (!messages.length) return;
        const peerUuid = userUuid;
        const remove = getPrivateMessageDeleter(peerUuid);
        modals.open(PrivateMessageHistoryConfirmation, {
            userName,
            confirm: (): void => {
                if (!lifetime.signal.aborted && userUuid === peerUuid) remove();
            },
        });
    }

    function handleHistoryScroll(): void {
        if (!messageHistory) return;
        // Match the chat timeline's 20px bottom tolerance, without a smooth-scroll animation.
        followLatest = messageHistory.scrollHeight - messageHistory.scrollTop - messageHistory.clientHeight <= 20;
    }

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
        const recordMessage = getPrivateMessageRecorder();
        return send(message)
            .then(() => {
                if (lifetime.signal.aborted) return;
                recordMessage({ peerUuid: userUuid, peerName: userName, text: message, incoming: false });
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
            <div
                bind:this={messageHistory}
                class="max-h-64 overflow-y-auto flex flex-col gap-2"
                aria-live="polite"
                onscroll={handleHistoryScroll}
            >
                {#each messages as message (message.id)}
                    <div class="select-text shrink-0 rounded bg-white/10 p-3">
                        <div class="flex justify-between items-start gap-2">
                            <strong>{message.incoming ? message.peerName : $LL.chat.you()}</strong>
                            <Button
                                type="button"
                                size="xs"
                                square
                                aria-label={$LL.chat.privateMessage.deleteMessage()}
                                title={$LL.chat.privateMessage.deleteMessage()}
                                onclick={() => getPrivateMessageDeleter(userUuid)(message.id)}
                            >
                                {#snippet icon()}<IconX />{/snippet}
                            </Button>
                        </div>
                        <p class="m-0 whitespace-pre-wrap break-words">{message.text}</p>
                    </div>
                {/each}
            </div>
            <Button type="button" disabled={!messages.length} onclick={requestClearHistory}>
                {$LL.chat.privateMessage.clearHistory()}
            </Button>
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
