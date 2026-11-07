<script lang="ts">
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { NightMode, nightModeStore, nightDateStore } from "../../Stores/NightStore";

    interface Props {
        mapEditorRightOffset?: number;
    }
    let { mapEditorRightOffset = 0 }: Props = $props();
    let formatter = $derived(
        new Intl.DateTimeFormat($locale, {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            ...($nightModeStore === NightMode.Computer ? {} : { timeZone: "Europe/Paris" }),
        }),
    );
</script>

{#if $nightDateStore}
    <time
        data-testid="world-clock"
        datetime={$nightDateStore.toISOString()}
        title={$nightModeStore === NightMode.Computer
            ? $LL.menu.settings.night.computer()
            : $LL.menu.settings.night.server()}
        class="fixed bottom-2 mobile:bottom-24 rounded bg-contrast/80 px-3 py-2 text-sm tabular-nums backdrop-blur"
        style:right={`calc(${mapEditorRightOffset}px + 3.5rem)`}>{formatter.format($nightDateStore)}</time
    >
{/if}
