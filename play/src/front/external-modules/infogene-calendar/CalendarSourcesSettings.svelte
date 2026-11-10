<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import LL from "../../../i18n/i18n-svelte";
    import Button from "../../Components/UI/Button.svelte";
    import InputSwitch from "../../Components/Input/InputSwitch.svelte";
    import { inputFormFocusStore } from "../../Stores/UserInputStore";
    import { CALENDAR_LABEL_MAX_LENGTH, CALENDAR_URL_MAX_LENGTH } from "../../../common/Calendar";
    import {
        CalendarApiError,
        addCalendarSource,
        deleteCalendarSource,
        listCalendarSources,
        type CalendarApiErrorCode,
    } from "./CalendarApi";
    import {
        busyOptionStore,
        calendarRefresh,
        calendarSourcesStore,
        failedCalendarsStore,
    } from "./calendarModuleState";
    import { IconTrash } from "@wa-icons";

    let label = $state("");
    let url = $state("");
    let busy = $state(false);
    let error: CalendarApiErrorCode | undefined = $state(undefined);
    let busyOption = $state($busyOptionStore);

    // Requests still running when the panel closes are cancelled: their answer has nowhere to go.
    const abortController = new AbortController();
    onDestroy(() => abortController.abort());

    function fail(e: unknown): void {
        if (abortController.signal.aborted) return;
        error = e instanceof CalendarApiError ? e.code : "unavailable";
    }

    function reload(): Promise<void> {
        return listCalendarSources(abortController.signal).then((sources) => calendarSourcesStore.set(sources));
    }

    onMount(() => {
        reload().catch(fail);
    });

    /** One change at a time: the form is disabled until it ends, then the list and the agenda are read again. */
    function change(action: () => Promise<void>): void {
        if (busy) return;
        busy = true;
        error = undefined;
        action()
            .then(() => reload())
            .then(() => calendarRefresh.request())
            .catch(fail)
            .finally(() => {
                busy = false;
            });
    }

    function add(event: SubmitEvent): void {
        event.preventDefault();
        const input = { label, url };
        change(() =>
            addCalendarSource(input, abortController.signal).then(() => {
                label = "";
                url = "";
            }),
        );
    }

    function remove(id: string): void {
        change(() => deleteCalendarSource(id, abortController.signal));
    }

    // Typing in the form must not walk the avatar.
    const focusHandlers = {
        onfocus: () => inputFormFocusStore.set(true),
        onblur: () => inputFormFocusStore.set(false),
        onkeydown: (event: KeyboardEvent) => event.stopPropagation(),
    };
</script>

<section class="mt-3 flex w-full flex-col gap-2 rounded-md bg-contrast/40 p-3 text-sm">
    <h4 class="m-0 text-base normal-case">{$LL.externalModule.outlookIcs.title()}</h4>
    <p class="m-0 text-contrast-200">{$LL.externalModule.outlookIcs.explain()}</p>

    {#if $calendarSourcesStore.length === 0}
        <p class="m-0 italic text-contrast-200">{$LL.externalModule.outlookIcs.empty()}</p>
    {:else}
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
            {#each $calendarSourcesStore as source (source.id)}
                <li class="flex items-center justify-between gap-2">
                    <span class="min-w-0 truncate">
                        <strong>{source.label}</strong>
                        <span class="text-xs text-contrast-200">{source.host}</span>
                    </span>
                    <Button
                        variant="danger"
                        appearance="ghost"
                        size="xs"
                        square
                        disabled={busy}
                        aria-label={$LL.externalModule.outlookIcs.remove({ label: source.label })}
                        title={$LL.externalModule.outlookIcs.remove({ label: source.label })}
                        onclick={() => remove(source.id)}
                    >
                        {#snippet icon()}<IconTrash font-size={16} />{/snippet}
                    </Button>
                </li>
            {/each}
        </ul>
    {/if}

    {#if $failedCalendarsStore.length > 0}
        <p class="m-0 text-warning">
            {$LL.externalModule.outlookIcs.failed({ labels: $failedCalendarsStore.join(", ") })}
        </p>
    {/if}

    <form class="flex flex-col gap-2" onsubmit={add}>
        <label class="flex flex-col gap-1">
            <span>{$LL.externalModule.outlookIcs.label()}</span>
            <input
                class="input-text"
                type="text"
                maxlength={CALENDAR_LABEL_MAX_LENGTH}
                required
                placeholder={$LL.externalModule.outlookIcs.labelPlaceholder()}
                bind:value={label}
                disabled={busy}
                {...focusHandlers}
            />
        </label>
        <label class="flex flex-col gap-1">
            <span>{$LL.externalModule.outlookIcs.url()}</span>
            <input
                class="input-text"
                type="url"
                maxlength={CALENDAR_URL_MAX_LENGTH}
                required
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
                bind:value={url}
                disabled={busy}
                autocomplete="off"
                {...focusHandlers}
            />
        </label>
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
            {$LL.externalModule.outlookIcs.add()}
        </Button>
    </form>

    {#if error}
        <p class="m-0 text-danger" role="alert">{$LL.externalModule.outlookIcs.errors[error]()}</p>
    {/if}

    <p class="m-0 text-xs text-contrast-200">{$LL.externalModule.outlookIcs.delay()}</p>

    <InputSwitch
        id="infogene-calendar-busy"
        label={$LL.externalModule.outlookIcs.busyOption()}
        bind:value={busyOption}
        onchange={() => busyOptionStore.set(busyOption)}
        variant="white"
    >
        {#snippet description()}
            <span class="text-xs text-contrast-200">{$LL.externalModule.outlookIcs.busyOptionHelp()}</span>
        {/snippet}
    </InputSwitch>
</section>
