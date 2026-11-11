<script lang="ts">
    import type { CalendarEventInterface } from "@workadventure/shared-utils";
    import { goToMeetingStore } from "../../Stores/CalendarStore";
    import Button from "../UI/Button.svelte";
    import LL from "../../../i18n/i18n-svelte";
    import { canGoToMeeting } from "./CalendarReminder";

    interface Props {
        event: CalendarEventInterface;
        class?: string;
        /** Called after the user chose to go there. */
        ongo?: () => void;
    }

    let { event, class: className = "", ongo }: Props = $props();
</script>

<!-- "Go there": open the meeting in Teams and walk to its room (Mac companion meetings), until the meeting ends. -->
{#if canGoToMeeting(event, $goToMeetingStore)}
    <Button
        variant="secondary"
        class={className}
        onclick={() => {
            $goToMeetingStore?.(event);
            ongo?.();
        }}
    >
        {$LL.externalModule.calendar.goToMeeting()}
    </Button>
{/if}
