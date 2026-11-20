<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import ToastContainer from "../Toasts/ToastContainer.svelte";

    interface Props {
        responderName?: string;
        toastUuid: string;
    }

    let { responderName, toastUuid = "" }: Props = $props();
    const duration = 6000;
</script>

<ToastContainer theme="secondary" extraClasses="" {toastUuid} {duration}>
    {$LL.chat.meetingInvitation.noAnswer({
        name: responderName || $LL.chat.meetingInvitation.defaultResponderName(),
    })}
</ToastContainer>
