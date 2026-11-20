<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { toastStore } from "../../Stores/ToastStoreSingleton";
    import ToastContainer from "../Toasts/ToastContainer.svelte";

    interface Props {
        callerName: string;
        callerUuid: string;
        callerUserId?: number;
        toastUuid: string;
    }

    // A missed call stays until it is closed or answered by a call back.
    let { callerName, callerUuid, callerUserId, toastUuid }: Props = $props();

    function callBack(): void {
        gameManager.getCurrentGameScene().inviteManager?.requestMeetingInvitation(callerUuid, callerUserId, callerName);
        toastStore.removeToast(toastUuid);
    }
</script>

<ToastContainer theme="error" extraClasses="" {toastUuid}>
    <span data-testid="meeting-invitation-missed">
        {$LL.chat.meetingInvitation.missedCall({
            name: callerName || $LL.chat.meetingInvitation.defaultResponderName(),
        })}
    </span>
    {#snippet buttons()}
        <button type="button" class="btn btn-ghost btn-sm flex-1" onclick={() => toastStore.removeToast(toastUuid)}>
            {$LL.chat.meetingInvitation.close()}
        </button>
        <button type="button" class="btn btn-secondary btn-sm flex-1" onclick={callBack}>
            {$LL.chat.meetingInvitation.callBack()}
        </button>
    {/snippet}
</ToastContainer>
