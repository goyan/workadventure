<script lang="ts">
    import {
        BALL_MAX_TILES,
        BALL_MIN_TILES,
        COLD_MAX_CELSIUS,
        COLD_MAX_TILES,
        COLD_MIN_CELSIUS,
        COLD_MIN_TILES,
        DOWNPOUR_MAX_TILES,
        DOWNPOUR_MIN_TILES,
        DRAIN_MAX_TILES,
        DRAIN_MIN_TILES,
        FIRE_MAX_TILES,
        FIRE_MIN_TILES,
        HURRICANE_MAX_MINUTES,
        HURRICANE_MIN_MINUTES,
        hurricaneMaxWind,
        METEOR_MAX_TILES,
        METEOR_MIN_TILES,
    } from "@workadventure/map-editor";
    import { onDestroy, untrack } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        armedCatastropheStore,
        ballDiameterTilesStore,
        catastrophePanelStore,
        coldCelsiusStore,
        coldLyingStore,
        coldRadiusTilesStore,
        disarmCatastrophe,
        downpourRadiusTilesStore,
        drainRadiusTilesStore,
        downpourWholeMapStore,
        fireRadiusTilesStore,
        hurricaneCategoryStore,
        hurricaneHeadingStore,
        hurricaneMinutesStore,
        hurricaneShownStore,
        meteorRadiusTilesStore,
        toggleArmedCatastrophe,
    } from "../../Stores/CatastropheStore";
    import { compassPointOf } from "../../Phaser/Game/Weather/WindDirection";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";
    import ChipPopover from "../ClockLine/ChipPopover.svelte";
    import InfoTip from "../Input/InfoTip.svelte";
    import { stopColdSnap } from "./coldSnapActions";
    import { startHurricane, stopHurricane } from "./hurricaneActions";
    import WeatherTab from "./WeatherTab.svelte";

    const shown = $derived($catastrophePanelStore);
    /** The disasters to throw on the map, or the weather of the room they go by. */
    let tab = $state<"catastrophes" | "weather">("catastrophes");
    // Nothing stays armed behind the weather tab.
    function show(next: "catastrophes" | "weather"): void {
        tab = next;
        if (next === "weather") disarmCatastrophe();
    }
    const meteorArmed = $derived($armedCatastropheStore === "meteor");
    const fireballArmed = $derived($armedCatastropheStore === "fireball");
    const downpourArmed = $derived($armedCatastropheStore === "downpour");
    const fireArmed = $derived($armedCatastropheStore === "fire");
    const drainArmed = $derived($armedCatastropheStore === "drain");
    const ballArmed = $derived($armedCatastropheStore === "ball");
    const coldArmed = $derived($armedCatastropheStore === "cold");
    // The size shown is that of the armed catastrophe, and stays that of the last one armed.
    let sized = $state<"meteor" | "fireball" | "downpour" | "fire" | "drain" | "ball" | "cold">("meteor");
    $effect(() => {
        if ($armedCatastropheStore !== undefined) {
            sized = $armedCatastropheStore;
            hurricaneOpen = false;
        }
    });
    /**
     * The settings of the hurricane are shown in place of the size of a disaster: a hurricane is not thrown at a
     * point, it crosses the whole map once launched.
     */
    let hurricaneOpen = $state(false);
    function toggleHurricane(): void {
        hurricaneOpen = !hurricaneOpen;
        if (hurricaneOpen) disarmCatastrophe();
    }

    /** What the panel says of the hurricane crossing the map, as the server last told it. */
    const hurricaneGoing = $derived.by((): string | undefined => {
        const going = $hurricaneShownStore;
        if (!going?.here) return undefined;
        const { hurricane, here: now } = going;
        const secondsLeft = Math.max(0, Math.round((1 - now.progress) * (hurricane.durationMs / 1000)));
        const phases = $LL.actionbar.catastrophe.hurricanePhase;
        const phase =
            now.phase === "eye"
                ? phases.eye()
                : now.phase === "wall"
                  ? now.after
                      ? phases.wallAfter()
                      : phases.wall()
                  : now.after
                    ? phases.bandsAfter()
                    : phases.bands();
        return $LL.actionbar.catastrophe.hurricaneGoing({
            category: hurricane.category,
            phase,
            wind: Math.round(now.windSpeed),
            gust: Math.round(now.gust),
            rain: now.rainRate < 10 ? now.rainRate.toFixed(1) : Math.round(now.rainRate),
            left:
                secondsLeft >= 60
                    ? $LL.actionbar.catastrophe.coldLeftMinutes({
                          minutes: Math.floor(secondsLeft / 60),
                          seconds: secondsLeft % 60,
                      })
                    : $LL.actionbar.catastrophe.coldLeftSeconds({ seconds: secondsLeft }),
        });
    });
    const hurricanePoint = $derived(compassPointOf(Number($hurricaneHeadingStore)) ?? "n");

    interface Props {
        /** Only the icon of the chip is drawn: the clock line is short of room. */
        compact?: boolean;
    }
    let { compact = false }: Props = $props();

    /** Whether the panel is open under its chip; closing it leaves the disaster armed. */
    let open = $state(false);
    // Shown from the apps menu, the chip opens its panel at once: the player came to pick a disaster.
    let wasShown = untrack(() => shown);
    $effect(() => {
        if (shown && !wasShown) open = true;
        if (!shown) open = false;
        wasShown = shown;
    });

    const names = $derived({
        meteor: $LL.actionbar.catastrophe.meteor(),
        fireball: $LL.actionbar.catastrophe.fireball(),
        downpour: $LL.actionbar.catastrophe.downpour(),
        fire: $LL.actionbar.catastrophe.fire(),
        drain: $LL.actionbar.catastrophe.drain(),
        ball: $LL.actionbar.catastrophe.ball(),
        cold: $LL.actionbar.catastrophe.cold(),
    });
    const icons = {
        meteor: "comet",
        fireball: "meteor",
        downpour: "downpour",
        fire: "fire",
        drain: "drain",
        ball: "ball",
        cold: "cold",
    } as const;
    /** The size of the armed disaster, in tiles; none for a downpour on the whole map. */
    const armedTiles = $derived.by((): number | undefined => {
        switch ($armedCatastropheStore) {
            case "meteor":
            case "fireball":
                return $meteorRadiusTilesStore;
            case "downpour":
                return $downpourWholeMapStore ? undefined : $downpourRadiusTilesStore;
            case "fire":
                return $fireRadiusTilesStore;
            case "drain":
                return $drainRadiusTilesStore;
            case "ball":
                return $ballDiameterTilesStore;
            case "cold":
                return $coldRadiusTilesStore;
            default:
                return undefined;
        }
    });
    /** What the chip says: "Ball · 4 tiles" while a disaster is armed. */
    const chipLabel = $derived(
        $armedCatastropheStore === undefined
            ? $LL.actionbar.catastrophe.chip()
            : $LL.actionbar.catastrophe.chipArmed({
                  name: names[$armedCatastropheStore],
                  size:
                      armedTiles === undefined
                          ? $LL.actionbar.catastrophe.wholeMap()
                          : $LL.actionbar.catastrophe.size({ tiles: armedTiles }),
              }),
    );
    const help = $derived(
        hurricaneOpen
            ? $LL.actionbar.catastrophe.hurricaneHelp()
            : ballArmed
              ? $LL.actionbar.catastrophe.ballArmedHelp()
              : coldArmed
                ? $LL.actionbar.catastrophe.coldArmedHelp()
                : downpourArmed || drainArmed
                  ? $LL.actionbar.catastrophe.downpourArmedHelp()
                  : meteorArmed || fireballArmed || fireArmed
                    ? $LL.actionbar.catastrophe.armedHelp()
                    : $LL.actionbar.catastrophe.idleHelp(),
    );

    /** What the panel says of the cold air lying on the map: its temperature, and how long it still has. */
    const coldLying = $derived.by((): string | undefined => {
        const lying = $coldLyingStore;
        if (!lying) return undefined;
        if (lying.secondsLeft === undefined) return $LL.actionbar.catastrophe.coldHeld({ celsius: lying.celsius });
        return $LL.actionbar.catastrophe.coldLying({
            celsius: lying.celsius,
            left:
                lying.secondsLeft >= 60
                    ? $LL.actionbar.catastrophe.coldLeftMinutes({
                          minutes: Math.floor(lying.secondsLeft / 60),
                          seconds: lying.secondsLeft % 60,
                      })
                    : $LL.actionbar.catastrophe.coldLeftSeconds({ seconds: lying.secondsLeft }),
        });
    });

    // Escape disarms first (the panel open or not); with nothing armed, it closes the panel.
    function onEscape(): boolean {
        if ($armedCatastropheStore === undefined) return false;
        disarmCatastrophe();
        return true;
    }

    onDestroy(disarmCatastrophe);
</script>

{#if shown}
    <ChipPopover
        label={chipLabel}
        hint={$LL.actionbar.catastrophe.chipHint()}
        {compact}
        active={$armedCatastropheStore !== undefined}
        bind:open
        testid="catastrophe-chip"
        {onEscape}
        listenEscape={$armedCatastropheStore !== undefined}
    >
        {#snippet icon()}
            <PixelIcon name={$armedCatastropheStore ? icons[$armedCatastropheStore] : "meteor"} size={16} />
        {/snippet}
        {#snippet badge()}
            {#if armedTiles !== undefined}<span class="tabular-nums">{armedTiles}</span>{/if}
        {/snippet}
        <div class="flex min-h-0 flex-col items-start gap-1.5" data-testid="catastrophe-widget">
            <div class="flex shrink-0 gap-1 rounded-full bg-white/10 p-1" role="tablist">
                {#each ["catastrophes", "weather"] as const as name (name)}
                    <button
                        type="button"
                        role="tab"
                        class="rounded-full px-2 py-0.5 {tab === name ? 'bg-white/30' : 'hover:bg-white/20'}"
                        aria-selected={tab === name}
                        data-testid="catastrophe-tab-{name}"
                        onclick={() => show(name)}
                    >
                        {$LL.actionbar.catastrophe.tabs[name]()}
                    </button>
                {/each}
            </div>
            {#if tab === "weather"}
                <!-- The only part that may be higher than the room under the chip: it scrolls inside the panel. -->
                <div class="min-h-0 overflow-y-auto overscroll-contain pe-1" role="tabpanel">
                    <WeatherTab />
                </div>
            {:else}
                <div
                    class="flex flex-wrap items-center gap-x-3 gap-y-1.5"
                    role="group"
                    aria-label={$LL.actionbar.catastrophe.label()}
                    data-testid="catastrophe-panel"
                >
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {meteorArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={meteorArmed}
                        data-testid="catastrophe-meteor"
                        onclick={() => toggleArmedCatastrophe("meteor")}
                    >
                        <PixelIcon name="comet" size={16} />
                        <span>{$LL.actionbar.catastrophe.meteor()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {fireballArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={fireballArmed}
                        data-testid="catastrophe-fireball"
                        onclick={() => toggleArmedCatastrophe("fireball")}
                    >
                        <PixelIcon name="meteor" size={16} />
                        <span>{$LL.actionbar.catastrophe.fireball()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {downpourArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={downpourArmed}
                        data-testid="catastrophe-downpour"
                        onclick={() => toggleArmedCatastrophe("downpour")}
                    >
                        <PixelIcon name="downpour" size={16} />
                        <span>{$LL.actionbar.catastrophe.downpour()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {fireArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={fireArmed}
                        data-testid="catastrophe-fire"
                        onclick={() => toggleArmedCatastrophe("fire")}
                    >
                        <PixelIcon name="fire" size={16} />
                        <span>{$LL.actionbar.catastrophe.fire()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {drainArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={drainArmed}
                        data-testid="catastrophe-drain"
                        onclick={() => toggleArmedCatastrophe("drain")}
                    >
                        <PixelIcon name="drain" size={16} />
                        <span>{$LL.actionbar.catastrophe.drain()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {ballArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={ballArmed}
                        data-testid="catastrophe-ball"
                        onclick={() => toggleArmedCatastrophe("ball")}
                    >
                        <PixelIcon name="ball" size={16} />
                        <span>{$LL.actionbar.catastrophe.ball()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {coldArmed
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={coldArmed}
                        data-testid="catastrophe-cold"
                        onclick={() => toggleArmedCatastrophe("cold")}
                    >
                        <PixelIcon name="cold" size={16} />
                        <span>{$LL.actionbar.catastrophe.cold()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {hurricaneOpen
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={hurricaneOpen}
                        data-testid="catastrophe-hurricane"
                        onclick={toggleHurricane}
                    >
                        <PixelIcon name="hurricane" size={16} />
                        <span>{$LL.actionbar.catastrophe.hurricane()}</span>
                    </button>
                    {#if hurricaneOpen}
                        <span class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5">
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-20"
                                    min="1"
                                    max="5"
                                    step="1"
                                    aria-label={$LL.actionbar.catastrophe.hurricaneCategoryLabel()}
                                    data-testid="catastrophe-hurricane-category"
                                    bind:value={$hurricaneCategoryStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.hurricaneCategory({
                                        category: $hurricaneCategoryStore,
                                        wind: hurricaneMaxWind(Number($hurricaneCategoryStore)),
                                    })}</span
                                >
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={HURRICANE_MIN_MINUTES}
                                    max={HURRICANE_MAX_MINUTES}
                                    step="1"
                                    aria-label={$LL.actionbar.catastrophe.hurricaneMinutesLabel()}
                                    data-testid="catastrophe-hurricane-minutes"
                                    bind:value={$hurricaneMinutesStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.hurricaneMinutes({
                                        minutes: $hurricaneMinutesStore,
                                    })}</span
                                >
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min="0"
                                    max="355"
                                    step="5"
                                    aria-label={$LL.actionbar.catastrophe.hurricaneHeadingLabel()}
                                    data-testid="catastrophe-hurricane-heading"
                                    bind:value={$hurricaneHeadingStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.hurricaneHeading({
                                        point: $LL.actionbar.weatherBanner.windPoint[hurricanePoint](),
                                        degrees: $hurricaneHeadingStore,
                                    })}</span
                                >
                            </label>
                            {#if hurricaneGoing === undefined}
                                <button
                                    type="button"
                                    class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                    data-testid="catastrophe-hurricane-start"
                                    onclick={startHurricane}
                                >
                                    {$LL.actionbar.catastrophe.hurricaneStart()}
                                </button>
                            {/if}
                        </span>
                    {:else if sized === "downpour"}
                        <label class="flex items-center gap-1 whitespace-nowrap">
                            <input
                                type="checkbox"
                                data-testid="catastrophe-downpour-whole-map"
                                bind:checked={$downpourWholeMapStore}
                            />
                            <span>{$LL.actionbar.catastrophe.wholeMap()}</span>
                        </label>
                        {#if !$downpourWholeMapStore}
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={DOWNPOUR_MIN_TILES}
                                    max={DOWNPOUR_MAX_TILES}
                                    step="1"
                                    aria-label={$LL.actionbar.catastrophe.downpourSizeLabel()}
                                    data-testid="catastrophe-downpour-size"
                                    bind:value={$downpourRadiusTilesStore}
                                />
                                <span class="whitespace-nowrap"
                                    >{$LL.actionbar.catastrophe.size({ tiles: $downpourRadiusTilesStore })}</span
                                >
                            </label>
                        {/if}
                    {:else if sized === "drain"}
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={DRAIN_MIN_TILES}
                                max={DRAIN_MAX_TILES}
                                step="1"
                                aria-label={$LL.actionbar.catastrophe.drainSizeLabel()}
                                data-testid="catastrophe-drain-size"
                                bind:value={$drainRadiusTilesStore}
                            />
                            <span class="whitespace-nowrap"
                                >{$LL.actionbar.catastrophe.size({ tiles: $drainRadiusTilesStore })}</span
                            >
                        </label>
                    {:else if sized === "cold"}
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={COLD_MIN_TILES}
                                max={COLD_MAX_TILES}
                                step="1"
                                aria-label={$LL.actionbar.catastrophe.coldSizeLabel()}
                                data-testid="catastrophe-cold-size"
                                bind:value={$coldRadiusTilesStore}
                            />
                            <span class="whitespace-nowrap"
                                >{$LL.actionbar.catastrophe.size({ tiles: $coldRadiusTilesStore })}</span
                            >
                        </label>
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={COLD_MIN_CELSIUS}
                                max={COLD_MAX_CELSIUS}
                                step="5"
                                aria-label={$LL.actionbar.catastrophe.coldCelsiusLabel()}
                                data-testid="catastrophe-cold-celsius"
                                bind:value={$coldCelsiusStore}
                            />
                            <span class="whitespace-nowrap tabular-nums"
                                >{$LL.actionbar.catastrophe.coldCelsius({ celsius: $coldCelsiusStore })}</span
                            >
                        </label>
                    {:else if sized === "ball"}
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={BALL_MIN_TILES}
                                max={BALL_MAX_TILES}
                                step="1"
                                aria-label={$LL.actionbar.catastrophe.ballSizeLabel()}
                                data-testid="catastrophe-ball-size"
                                bind:value={$ballDiameterTilesStore}
                            />
                            <span class="whitespace-nowrap"
                                >{$LL.actionbar.catastrophe.size({ tiles: $ballDiameterTilesStore })}</span
                            >
                        </label>
                    {:else if sized === "fire"}
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={FIRE_MIN_TILES}
                                max={FIRE_MAX_TILES}
                                step="1"
                                aria-label={$LL.actionbar.catastrophe.fireSizeLabel()}
                                data-testid="catastrophe-fire-size"
                                bind:value={$fireRadiusTilesStore}
                            />
                            <span class="whitespace-nowrap"
                                >{$LL.actionbar.catastrophe.size({ tiles: $fireRadiusTilesStore })}</span
                            >
                        </label>
                    {:else}
                        <label class="flex items-center gap-2">
                            <input
                                type="range"
                                class="w-24"
                                min={METEOR_MIN_TILES}
                                max={METEOR_MAX_TILES}
                                step="1"
                                aria-label={$LL.actionbar.catastrophe.sizeLabel()}
                                data-testid="catastrophe-meteor-size"
                                bind:value={$meteorRadiusTilesStore}
                            />
                            <span class="whitespace-nowrap"
                                >{$LL.actionbar.catastrophe.size({ tiles: $meteorRadiusTilesStore })}</span
                            >
                        </label>
                    {/if}
                    {#if hurricaneGoing !== undefined}
                        <!-- A hurricane crosses the map: where it is, how hard it blows and rains, how to stop it. -->
                        <span class="flex basis-full items-center gap-2">
                            <span class="tabular-nums" data-testid="catastrophe-hurricane-going">{hurricaneGoing}</span>
                            <button
                                type="button"
                                class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                data-testid="catastrophe-hurricane-stop"
                                onclick={stopHurricane}
                            >
                                {$LL.actionbar.catastrophe.hurricaneStop()}
                            </button>
                        </span>
                    {/if}
                    {#if coldLying !== undefined}
                        <!-- Cold air lies on the map: how cold, for how long, and how to stop it. -->
                        <span class="flex basis-full items-center gap-2">
                            <span class="tabular-nums" data-testid="catastrophe-cold-lying">{coldLying}</span>
                            <button
                                type="button"
                                class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                data-testid="catastrophe-cold-stop"
                                onclick={stopColdSnap}
                            >
                                {$LL.actionbar.catastrophe.coldStop()}
                            </button>
                        </span>
                    {/if}
                    <!-- How to throw the disaster chosen: behind an i, out of the way of the map. -->
                    <InfoTip label={$LL.actionbar.catastrophe.infoLabel()} text={help} testid="catastrophe-info" />
                </div>
            {/if}
        </div>
    </ChipPopover>
{/if}
