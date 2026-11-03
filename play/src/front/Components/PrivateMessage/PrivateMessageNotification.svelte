<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { privateMessageNotificationStore } from "../../Stores/PrivateMessageStore";
    import ButtonClose from "../Input/ButtonClose.svelte";
    import { openPrivateMessage } from "./openPrivateMessage";
</script>

{#if $privateMessageNotificationStore}
    {@const message = $privateMessageNotificationStore}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto"
        role="status"
    >
        <div class="flex items-center justify-between gap-3">
            <strong>{$LL.chat.privateMessage.label()} · {message.peerName}</strong>
            <ButtonClose onclick={() => privateMessageNotificationStore.set(undefined)} />
        </div>
        <p class="whitespace-pre-wrap break-words max-h-32 overflow-auto">{message.text}</p>
        <button
            class="rounded bg-white/10 hover:bg-white/20 px-3 py-2"
            onclick={() => {
                openPrivateMessage(message.peerUuid, message.peerName);
                privateMessageNotificationStore.set(undefined);
            }}>{$LL.chat.userList.sendMessage()}</button
        >
    </div>
{/if}
