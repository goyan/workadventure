<script lang="ts">
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { fastDayOnStore, fastDaySkyStore, fastDaySpeedStore } from "../../Stores/FastDayStore";
    import { mapTimeZoneStore } from "../../Stores/NightStore";
    import { FAST_DAY_FASTEST, FAST_DAY_SLOWEST, fastDaySpeed } from "../../Phaser/Game/Night/FastDayClock";
    import { IconSunMoon } from "@wa-icons";

    const labels = $derived($LL.actionbar.fastDay);

    /** The time of the sky shown, at the place of the map, while the day is sped up. */
    const skyTime = $derived.by(() => {
        const sky = $fastDaySkyStore;
        if (!sky) return undefined;
        try {
            return new Intl.DateTimeFormat($locale || undefined, {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: $mapTimeZoneStore,
            }).format(sky);
        } catch {
            return new Intl.DateTimeFormat($locale || undefined, { hour: "2-digit", minute: "2-digit" }).format(sky);
        }
    });

    function setSpeed(event: Event): void {
        fastDaySpeedStore.set(fastDaySpeed(Number((event.currentTarget as HTMLInputElement).value)));
    }
</script>

<!-- The day and the night sped up for this player alone (FastDayClock): the sky they see, nothing of the map. -->
<div
    class="flex items-center gap-1 rounded-lg bg-contrast/80 p-0.5 text-xs text-white backdrop-blur pointer-events-auto"
    data-testid="fast-day"
>
    <button
        type="button"
        class="flex h-7 min-w-7 items-center justify-center rounded px-1 {$fastDayOnStore
            ? 'bg-white/90 text-contrast'
            : 'hover:bg-white/15'}"
        aria-pressed={$fastDayOnStore}
        aria-label={$fastDayOnStore ? labels.stop() : labels.start()}
        title={$fastDayOnStore ? labels.stop() : labels.start()}
        data-testid="fast-day-toggle"
        onclick={() => fastDayOnStore.update((on) => !on)}
    >
        <IconSunMoon width="16" height="16" />
    </button>
    {#if $fastDayOnStore}
        <input
            type="range"
            class="w-20 accent-white"
            min={FAST_DAY_SLOWEST}
            max={FAST_DAY_FASTEST}
            step="1"
            value={$fastDaySpeedStore}
            aria-label={labels.speed({ speed: $fastDaySpeedStore })}
            title={labels.speed({ speed: $fastDaySpeedStore })}
            data-testid="fast-day-speed"
            oninput={setSpeed}
        />
        <span class="tabular-nums" data-testid="fast-day-factor">×{$fastDaySpeedStore}</span>
        {#if skyTime}
            <span class="px-1 tabular-nums" title={labels.sky({ time: skyTime })} data-testid="fast-day-sky"
                >{skyTime}</span
            >
        {/if}
    {/if}
</div>
