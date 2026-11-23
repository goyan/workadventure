<script lang="ts">
    import { untrack } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        visualisationPanelStore,
        waterFlowOverlayStore,
        weatherExplainedStore,
        weatherPipetteStore,
    } from "../../Stores/VisualisationStore";
    import ChipPopover from "../ClockLine/ChipPopover.svelte";
    import InfoTip from "../Input/InfoTip.svelte";
    import { IconCloud, IconColorPicker, IconDroplet, IconEye } from "@wa-icons";

    interface Props {
        /** Only the icon of the chip is drawn: the clock line is short of room. */
        compact?: boolean;
    }
    let { compact = false }: Props = $props();

    const shown = $derived($visualisationPanelStore);
    const flowing = $derived($waterFlowOverlayStore);
    const explaining = $derived($weatherExplainedStore);
    const probing = $derived($weatherPipetteStore);

    /** Whether the tiles are open under the chip; what they show stays when they close. */
    let open = $state(false);
    // Shown from the apps menu, the chip opens its tiles at once: the player came to pick what to show.
    let wasShown = untrack(() => shown);
    $effect(() => {
        if (shown && !wasShown) open = true;
        if (!shown) open = false;
        wasShown = shown;
    });

    /** What the chip says: what is shown on the map, or its name when nothing is. */
    const chipLabel = $derived.by(() => {
        const on = [
            ...(flowing ? [$LL.actionbar.visualisation.waterFlow()] : []),
            ...(explaining ? [$LL.actionbar.visualisation.weather.button()] : []),
            ...(probing ? [$LL.actionbar.visualisation.weather.pipette.button()] : []),
        ];
        if (on.length === 0) return $LL.actionbar.visualisation.label();
        if (on.length === 1) return on[0];
        return $LL.actionbar.visualisation.chipShown({ count: on.length });
    });

    // Escape puts the pipette away first, the tiles open or not; with it away, it closes the tiles.
    function onEscape(): boolean {
        if (!probing) return false;
        weatherPipetteStore.set(false);
        return true;
    }
</script>

{#if shown}
    <ChipPopover
        label={chipLabel}
        hint={$LL.actionbar.visualisation.chipHint()}
        {compact}
        active={flowing || explaining || probing}
        {onEscape}
        listenEscape={probing}
        bind:open
        testid="visualisation-chip"
    >
        {#snippet icon()}
            <IconEye width="16" height="16" />
        {/snippet}
        <div
            class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
            role="group"
            aria-label={$LL.actionbar.visualisation.label()}
            data-testid="visualisation-widget"
        >
            <button
                type="button"
                class="flex items-center gap-1 rounded-full px-2 py-1 {flowing
                    ? 'bg-white/30 ring-1 ring-white'
                    : 'bg-white/10 hover:bg-white/20'}"
                aria-pressed={flowing}
                data-testid="visualisation-water-flow"
                onclick={() => waterFlowOverlayStore.update((on) => !on)}
            >
                <IconDroplet width="16" height="16" />
                <span>{$LL.actionbar.visualisation.waterFlow()}</span>
            </button>
            <button
                type="button"
                class="flex items-center gap-1 rounded-full px-2 py-1 {explaining
                    ? 'bg-white/30 ring-1 ring-white'
                    : 'bg-white/10 hover:bg-white/20'}"
                aria-pressed={explaining}
                data-testid="visualisation-weather-explained"
                onclick={() => weatherExplainedStore.update((on) => !on)}
            >
                <IconCloud width="16" height="16" />
                <span>{$LL.actionbar.visualisation.weather.button()}</span>
            </button>
            <button
                type="button"
                class="flex items-center gap-1 rounded-full px-2 py-1 {probing
                    ? 'bg-white/30 ring-1 ring-white'
                    : 'bg-white/10 hover:bg-white/20'}"
                aria-pressed={probing}
                title={$LL.actionbar.visualisation.weather.pipette.hint()}
                data-testid="visualisation-weather-pipette"
                onclick={() => weatherPipetteStore.update((on) => !on)}
            >
                <IconColorPicker width="16" height="16" />
                <span>{$LL.actionbar.visualisation.weather.pipette.button()}</span>
            </button>
            <InfoTip
                label={$LL.actionbar.visualisation.infoLabel()}
                text={flowing ? $LL.actionbar.visualisation.onHelp() : $LL.actionbar.visualisation.offHelp()}
                testid="visualisation-info"
            />
        </div>
    </ChipPopover>
{/if}
