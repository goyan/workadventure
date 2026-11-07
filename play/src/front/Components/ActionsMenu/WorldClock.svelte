<script lang="ts">
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { NightMode, nightModeStore, nightDateStore } from "../../Stores/NightStore";

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
        class="rounded-full bg-contrast/80 px-3 py-1.5 text-xs tabular-nums backdrop-blur"
        >{formatter.format($nightDateStore)}</time
    >
{/if}
