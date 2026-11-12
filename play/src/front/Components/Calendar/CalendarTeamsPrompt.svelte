<script lang="ts">
    import { fly } from "svelte/transition";
    import Button from "../UI/Button.svelte";
    import LL from "../../../i18n/i18n-svelte";
    import { scriptUtils } from "../../Api/ScriptUtils";
    import { closeTeamsPrompt, teamsPromptStore } from "./CalendarReminder";
    import { IconVideo, IconX } from "@wa-icons";

    // A new tab, as the agenda's Join button: the game window must never navigate away (an msteams: link opened there
    // unloads the page and closes the game connection). This click lets the browser open it.
    function open() {
        const url = $teamsPromptStore?.event.resource?.onlineMeeting?.joinUrl;
        closeTeamsPrompt();
        if (url) scriptUtils.openTab(url);
    }

    // Escape answers No, as the close button. Nothing is focused on purpose: the avatar's keys keep working.
    function onKeydown(keyboardEvent: KeyboardEvent) {
        if ($teamsPromptStore && keyboardEvent.key === "Escape") closeTeamsPrompt();
    }
</script>

<svelte:window onkeydown={onKeydown} />

{#if $teamsPromptStore}
    {@const prompt = $teamsPromptStore}
    <section
        aria-label={$LL.externalModule.calendar.openInTeamsQuestion()}
        class="pointer-events-auto mt-2 flex w-96 max-w-[calc(100vw-1rem)] flex-col gap-3.5 rounded-lg border border-solid border-white/10 bg-contrast/90 p-4 text-white shadow-dark backdrop-blur"
        in:fly={{ x: 100, duration: 250 }}
        out:fly={{ x: 100, duration: 200 }}
    >
        <div class="flex items-start gap-3">
            <div
                class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary/25 text-secondary-300"
            >
                <IconVideo class="h-6 w-6" aria-hidden="true" />
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-1">
                <span class="text-lg font-bold leading-tight">{$LL.externalModule.calendar.openInTeamsQuestion()}</span>
                <span class="truncate text-sm text-contrast-200">{prompt.event.title}</span>
                {#if prompt.reason === "rooms-full"}
                    <span class="text-sm text-contrast-200">{$LL.externalModule.calendar.goToMeetingRoomsFull()}</span>
                {/if}
            </div>
            <Button
                variant="light"
                appearance="ghost"
                size="sm"
                square
                class="-me-1.5 -mt-1.5 shrink-0"
                aria-label={$LL.actionbar.close()}
                onclick={closeTeamsPrompt}
            >
                {#snippet icon()}<IconX class="h-4 w-4" />{/snippet}
            </Button>
        </div>
        <div class="grid grid-cols-2 gap-2">
            <Button variant="light" appearance="border" class="m-0 w-full" onclick={closeTeamsPrompt}>
                {$LL.externalModule.calendar.openInTeamsNo()}
            </Button>
            <Button variant="secondary" class="m-0 w-full" onclick={open}>
                {#snippet icon()}<IconVideo class="h-5 w-5" />{/snippet}
                {$LL.externalModule.calendar.openInTeamsYes()}
            </Button>
        </div>
    </section>
{/if}
