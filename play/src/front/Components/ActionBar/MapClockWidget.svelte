<script lang="ts">
    import { onMount } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorActivated } from "../../Stores/MenuStore";
    import { mapClockSpeedsStore } from "../../Stores/MapClockStore";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import {
        FREEZE_THAW_CLOCK,
        freezeThawSettingMessage,
        hourLastsAt,
        mapClockSpeedsOf,
    } from "../../Phaser/Game/Weather/MapClocks";
    import type { MapClock } from "../../Phaser/Game/Weather/MapClocks";

    /**
     * A clock of the map at the speed of a player: « > » as in reality, « >> », « >>> » faster. Today the cold only
     * (the speed of the freeze and the thaw); another clock of the map would be another `clock`.
     */
    let { clock = FREEZE_THAW_CLOCK }: { clock?: MapClock } = $props();

    onMount(() => {
        // The speed of the map as it was read: the store follows its changes from then on.
        const wam = gameManager.getCurrentGameScene()?.getGameMap()?.getWamFile()?.getWam();
        mapClockSpeedsStore.update((speeds) => ({ ...mapClockSpeedsOf(wam), ...speeds }));
    });

    const speed = $derived($mapClockSpeedsStore[clock.id] ?? 1);
    const labels = $derived($LL.actionbar.mapClock.freezeThaw);
    const active = $derived(clock.steps.find((step) => step.speed === speed));

    /** What a speed makes of an hour, in words. */
    function lasts(at: number): string {
        if (at === 1) return labels.real();
        const lasting = hourLastsAt(at);
        const duration =
            "seconds" in lasting
                ? $LL.actionbar.mapClock.seconds({ count: lasting.seconds })
                : $LL.actionbar.mapClock.minutes({ count: lasting.minutes });
        return labels.faster({ speed: at, duration });
    }

    function choose(at: number): void {
        if (at === speed) return;
        // Shown at once; the map tells it back (and to everyone) once saved.
        mapClockSpeedsStore.update((speeds) => ({ ...speeds, [clock.id]: at }));
        executeUpdateWAMSettings({
            $case: "updateWaterSettingMessage",
            updateWaterSettingMessage: freezeThawSettingMessage(at),
        }).catch((error: unknown) => console.error("The speed of the freeze and the thaw could not be saved", error));
    }

    /** On a narrow bar, one button goes to the next step. */
    function next(): void {
        const index = clock.steps.findIndex((step) => step.speed === speed);
        choose(clock.steps[(index + 1) % clock.steps.length].speed);
    }
</script>

{#if $mapEditorActivated}
    <!-- Who may edit the map sets its clock here; the server checks the right as for any setting of the map. -->
    <div
        class="flex items-center gap-0.5 rounded-lg bg-contrast/80 p-0.5 text-xs text-white backdrop-blur pointer-events-auto"
        role="group"
        aria-label={labels.title()}
        data-testid="map-clock-{clock.id}"
        title={`${labels.title()} — ${lasts(speed)} ${labels.what()}`}
    >
        <!-- Wide bar: every step. -->
        <div class="hidden @md/actions:flex items-center gap-0.5">
            {#each clock.steps as step (step.speed)}
                <button
                    type="button"
                    class="h-7 min-w-7 rounded px-1 font-mono leading-none {step.speed === speed
                        ? 'bg-white/90 text-contrast'
                        : 'hover:bg-white/15'}"
                    aria-pressed={step.speed === speed}
                    aria-label={lasts(step.speed)}
                    title={lasts(step.speed)}
                    data-testid="map-clock-{clock.id}-{step.speed}"
                    onclick={() => choose(step.speed)}
                >
                    {step.glyph}
                </button>
            {/each}
        </div>
        <!-- Narrow bar: the step of the map, the next one at a click, back to ×1 at a click. -->
        <div class="flex @md/actions:hidden items-center gap-0.5">
            <button
                type="button"
                class="h-7 min-w-7 rounded px-1 font-mono leading-none {speed === 1
                    ? 'hover:bg-white/15'
                    : 'bg-white/90 text-contrast'}"
                aria-label={labels.cycle()}
                title={lasts(speed)}
                data-testid="map-clock-{clock.id}-next"
                onclick={next}
            >
                {active?.glyph ?? `×${speed}`}
            </button>
            {#if speed !== 1}
                <button
                    type="button"
                    class="h-7 min-w-7 rounded px-1 font-mono leading-none hover:bg-white/15"
                    aria-label={labels.reset()}
                    title={labels.reset()}
                    data-testid="map-clock-{clock.id}-reset"
                    onclick={() => choose(1)}
                >
                    ×1
                </button>
            {/if}
        </div>
        {#if !active}
            <!-- A speed set in the editor between the steps: told as it is. -->
            <span class="px-1 tabular-nums" data-testid="map-clock-{clock.id}-other">×{speed}</span>
        {/if}
    </div>
{:else if speed !== 1}
    <!-- The others only see that the cold of the map goes faster. -->
    <div
        class="flex items-center rounded-lg bg-contrast/80 px-2 py-1 text-xs leading-tight text-white tabular-nums backdrop-blur"
        data-testid="map-clock-{clock.id}-badge"
        title={labels.badgeHint({ speed })}
    >
        {labels.badge({ speed })}
    </div>
{/if}
