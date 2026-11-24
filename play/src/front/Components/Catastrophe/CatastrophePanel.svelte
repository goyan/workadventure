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
        HURRICANE_WATER_EFFECTS,
        hurricaneMaxWind,
        METEOR_MAX_TILES,
        METEOR_MIN_TILES,
        TSUNAMI_MAX_METRES,
        TSUNAMI_MAX_MINUTES,
        TSUNAMI_MIN_METRES,
        TSUNAMI_MIN_MINUTES,
        tsunamiLastsMs,
        tsunamiPhase,
        tsunamiRiseAt,
        TSUNAMI_FULL_CELERITY,
        ZOMBIE_MAX_COUNT,
        ZOMBIE_MAX_MINUTES,
        ZOMBIE_MIN_COUNT,
        ZOMBIE_MIN_MINUTES,
    } from "@workadventure/map-editor";
    import { onDestroy, untrack } from "svelte";
    import { LL, locale } from "../../../i18n/i18n-svelte";
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
        hurricaneHighestRiseStore,
        hurricaneMinutesStore,
        hurricaneShownStore,
        hurricaneWaterEffectStore,
        meteorRadiusTilesStore,
        toggleArmedCatastrophe,
        tsunamiMetresStore,
        tsunamiMinutesStore,
        tsunamiShownStore,
        zombieCountStore,
        zombieHeadingStore,
        zombieMinutesStore,
        zombieShownStore,
    } from "../../Stores/CatastropheStore";
    import { terrainWaterStatsStore } from "../../Stores/TerrainEditorStore";
    import { compassPointOf } from "../../Phaser/Game/Weather/WindDirection";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";
    import ChipPopover from "../ClockLine/ChipPopover.svelte";
    import InfoTip from "../Input/InfoTip.svelte";
    import { stopColdSnap } from "./coldSnapActions";
    import { startHurricane, stopHurricane } from "./hurricaneActions";
    import { startTsunami, stopTsunami } from "./tsunamiActions";
    import { startZombies, stopZombies } from "./zombieActions";
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
            tsunamiOpen = false;
            zombiesOpen = false;
        }
    });
    /**
     * The settings of the hurricane are shown in place of the size of a disaster: a hurricane is not thrown at a
     * point, it crosses the whole map once launched.
     */
    let hurricaneOpen = $state(false);
    function toggleHurricane(): void {
        hurricaneOpen = !hurricaneOpen;
        if (hurricaneOpen) {
            tsunamiOpen = false;
            zombiesOpen = false;
            disarmCatastrophe();
        }
    }
    /** The settings of the tsunami, in the same place: it comes in by the east edge of the map, not at a point. */
    let tsunamiOpen = $state(false);
    function toggleTsunami(): void {
        tsunamiOpen = !tsunamiOpen;
        if (tsunamiOpen) {
            hurricaneOpen = false;
            zombiesOpen = false;
            disarmCatastrophe();
        }
    }
    /** The settings of the horde of zombies, in the same place: it comes in by the edge it comes from, not at a point. */
    let zombiesOpen = $state(false);
    function toggleZombies(): void {
        zombiesOpen = !zombiesOpen;
        if (zombiesOpen) {
            hurricaneOpen = false;
            tsunamiOpen = false;
            disarmCatastrophe();
        }
    }

    /** What the panel says of the horde crossing the map, as this browser last counted it (once a second). */
    const zombiesGoing = $derived.by((): string | undefined => {
        const going = $zombieShownStore;
        if (!going) return undefined;
        return $LL.actionbar.catastrophe.zombiesGoing({
            walking: going.walking,
            minutes: Math.floor(going.secondsLeft / 60),
            seconds: going.secondsLeft % 60,
        });
    });
    const zombiesPoint = $derived(compassPointOf(Number($zombieHeadingStore)) ?? "n");

    /**
     * How much of the real speed of the waves of the tsunami the server bears, in %, when it bears less (it affords
     * fewer moves a step than the depth of the bore asks for): the panel says so. Undefined at full speed.
     */
    const tsunamiCelerity = $derived.by((): number | undefined => {
        const share = $terrainWaterStatsStore?.seaCelerity;
        if (tsunamiGoing === undefined || share === undefined || share >= TSUNAMI_FULL_CELERITY) return undefined;
        return Math.round(share * 100);
    });

    /** What the panel says of the tsunami coming in, as the server last told it (once a second). */
    const tsunamiGoing = $derived.by((): string | undefined => {
        const going = $tsunamiShownStore;
        if (!going || going.at === undefined) return undefined;
        const { tsunami, at } = going;
        const phase = tsunamiPhase(tsunami, at);
        if (phase === "over") return undefined;
        const secondsLeft = Math.max(0, Math.round((tsunami.startedAt + tsunamiLastsMs(tsunami) - at) / 1000));
        const level = new Intl.NumberFormat($locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
            tsunamiRiseAt(tsunami, at),
        );
        return $LL.actionbar.catastrophe.tsunamiGoing({
            metres: tsunami.metres,
            phase: $LL.actionbar.catastrophe.tsunamiPhase[phase](),
            level,
            left:
                secondsLeft >= 60
                    ? $LL.actionbar.catastrophe.coldLeftMinutes({
                          minutes: Math.floor(secondsLeft / 60),
                          seconds: secondsLeft % 60,
                      })
                    : $LL.actionbar.catastrophe.coldLeftSeconds({ seconds: secondsLeft }),
        });
    });

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
    /** The highest the water rose since the hurricane began, to the decimetre; undefined while it is not worth a line. */
    const hurricaneRise = $derived.by((): string | undefined => {
        const rise = $hurricaneHighestRiseStore;
        if (rise === undefined || rise < 0.05) return undefined;
        return new Intl.NumberFormat($locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rise);
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
            : tsunamiOpen
              ? $LL.actionbar.catastrophe.tsunamiHelp()
              : zombiesOpen
                ? $LL.actionbar.catastrophe.zombiesHelp()
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
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {tsunamiOpen
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={tsunamiOpen}
                        data-testid="catastrophe-tsunami"
                        onclick={toggleTsunami}
                    >
                        <PixelIcon name="tsunami" size={16} />
                        <span>{$LL.actionbar.catastrophe.tsunami()}</span>
                    </button>
                    <button
                        type="button"
                        class="flex items-center gap-1 rounded-full px-2 py-1 {zombiesOpen
                            ? 'bg-white/30 ring-1 ring-white'
                            : 'bg-white/10 hover:bg-white/20'}"
                        aria-pressed={zombiesOpen}
                        data-testid="catastrophe-zombies"
                        onclick={toggleZombies}
                    >
                        <PixelIcon name="zombie" size={16} />
                        <span>{$LL.actionbar.catastrophe.zombies()}</span>
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
                            <label class="flex items-center gap-2">
                                <span class="whitespace-nowrap"
                                    >{$LL.actionbar.catastrophe.hurricaneWaterEffectLabel()}</span
                                >
                                <select
                                    class="rounded bg-white/10 px-1 py-0.5"
                                    aria-label={$LL.actionbar.catastrophe.hurricaneWaterEffectLabel()}
                                    data-testid="catastrophe-hurricane-water-effect"
                                    value={String($hurricaneWaterEffectStore)}
                                    onchange={(event) =>
                                        hurricaneWaterEffectStore.set(Number(event.currentTarget.value))}
                                >
                                    {#each HURRICANE_WATER_EFFECTS as effect (effect)}
                                        <option value={String(effect)}>
                                            {effect === 1
                                                ? $LL.actionbar.catastrophe.hurricaneWaterRealistic()
                                                : $LL.actionbar.catastrophe.hurricaneWaterExaggerated({
                                                      times: effect,
                                                  })}
                                        </option>
                                    {/each}
                                </select>
                            </label>
                            <p class="m-0 basis-full text-xs opacity-70">
                                {$LL.actionbar.catastrophe.hurricaneWaterEffectHelp()}
                            </p>
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
                    {:else if tsunamiOpen}
                        <span class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5">
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={TSUNAMI_MIN_METRES}
                                    max={TSUNAMI_MAX_METRES}
                                    step="0.5"
                                    aria-label={$LL.actionbar.catastrophe.tsunamiMetresLabel()}
                                    data-testid="catastrophe-tsunami-metres"
                                    bind:value={$tsunamiMetresStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.tsunamiMetres({ metres: $tsunamiMetresStore })}</span
                                >
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={TSUNAMI_MIN_MINUTES}
                                    max={TSUNAMI_MAX_MINUTES}
                                    step="1"
                                    aria-label={$LL.actionbar.catastrophe.tsunamiMinutesLabel()}
                                    data-testid="catastrophe-tsunami-minutes"
                                    bind:value={$tsunamiMinutesStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.tsunamiMinutes({
                                        minutes: $tsunamiMinutesStore,
                                    })}</span
                                >
                            </label>
                            {#if tsunamiGoing === undefined}
                                <button
                                    type="button"
                                    class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                    data-testid="catastrophe-tsunami-start"
                                    onclick={startTsunami}
                                >
                                    {$LL.actionbar.catastrophe.tsunamiStart()}
                                </button>
                            {/if}
                        </span>
                    {:else if zombiesOpen}
                        <span class="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5">
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={ZOMBIE_MIN_COUNT}
                                    max={ZOMBIE_MAX_COUNT}
                                    step="100"
                                    aria-label={$LL.actionbar.catastrophe.zombiesCountLabel()}
                                    data-testid="catastrophe-zombies-count"
                                    bind:value={$zombieCountStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.zombiesCount({ count: $zombieCountStore })}</span
                                >
                            </label>
                            <label class="flex items-center gap-2">
                                <input
                                    type="range"
                                    class="w-24"
                                    min={ZOMBIE_MIN_MINUTES}
                                    max={ZOMBIE_MAX_MINUTES}
                                    step="1"
                                    aria-label={$LL.actionbar.catastrophe.zombiesMinutesLabel()}
                                    data-testid="catastrophe-zombies-minutes"
                                    bind:value={$zombieMinutesStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.zombiesMinutes({
                                        minutes: $zombieMinutesStore,
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
                                    aria-label={$LL.actionbar.catastrophe.zombiesHeadingLabel()}
                                    data-testid="catastrophe-zombies-heading"
                                    bind:value={$zombieHeadingStore}
                                />
                                <span class="whitespace-nowrap tabular-nums"
                                    >{$LL.actionbar.catastrophe.zombiesHeading({
                                        point: $LL.actionbar.weatherBanner.windPoint[zombiesPoint](),
                                        degrees: $zombieHeadingStore,
                                    })}</span
                                >
                            </label>
                            {#if zombiesGoing === undefined}
                                <button
                                    type="button"
                                    class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                    data-testid="catastrophe-zombies-start"
                                    onclick={startZombies}
                                >
                                    {$LL.actionbar.catastrophe.zombiesStart()}
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
                            {#if hurricaneRise !== undefined}
                                <span class="tabular-nums text-sky-300" data-testid="catastrophe-hurricane-rise">
                                    {$LL.actionbar.catastrophe.hurricaneRise({ rise: hurricaneRise })}
                                </span>
                            {/if}
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
                    {#if tsunamiGoing !== undefined}
                        <!-- A tsunami comes in: where it is, how high the sea stands at the coast, how to stop it. -->
                        <span class="flex basis-full items-center gap-2">
                            <span class="tabular-nums" data-testid="catastrophe-tsunami-going">{tsunamiGoing}</span>
                            {#if tsunamiCelerity !== undefined}
                                <span class="tabular-nums text-amber-300" data-testid="catastrophe-tsunami-celerity">
                                    {$LL.actionbar.catastrophe.tsunamiCelerity({ percent: tsunamiCelerity })}
                                </span>
                            {/if}
                            <button
                                type="button"
                                class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                data-testid="catastrophe-tsunami-stop"
                                onclick={stopTsunami}
                            >
                                {$LL.actionbar.catastrophe.tsunamiStop()}
                            </button>
                        </span>
                    {/if}
                    {#if zombiesGoing !== undefined}
                        <!-- A horde crosses the map: how many still walk, for how long, how to stop it. -->
                        <span class="flex basis-full items-center gap-2">
                            <span class="tabular-nums" data-testid="catastrophe-zombies-going">{zombiesGoing}</span>
                            <button
                                type="button"
                                class="rounded-full bg-white/10 px-2 py-1 hover:bg-white/20"
                                data-testid="catastrophe-zombies-stop"
                                onclick={stopZombies}
                            >
                                {$LL.actionbar.catastrophe.zombiesStop()}
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
