<script lang="ts">
    import {
        DOWNPOUR_MAX_TILES,
        DOWNPOUR_MIN_TILES,
        FIRE_MAX_TILES,
        FIRE_MIN_TILES,
        METEOR_MAX_TILES,
        METEOR_MIN_TILES,
    } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        armedCatastropheStore,
        catastrophePanelStore,
        disarmCatastrophe,
        downpourRadiusTilesStore,
        downpourWholeMapStore,
        fireRadiusTilesStore,
        meteorRadiusTilesStore,
        toggleArmedCatastrophe,
    } from "../../Stores/CatastropheStore";
    import { mapEditorModeStore } from "../../Stores/MapEditorStore";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";
    import WeatherTab from "./WeatherTab.svelte";

    const shown = $derived($catastrophePanelStore && !$mapEditorModeStore);
    /** The disasters to throw on the map, or the weather of the room they go by. */
    let tab = $state<"catastrophes" | "weather">("catastrophes");
    // Nothing stays armed behind the weather tab.
    function show(next: "catastrophes" | "weather"): void {
        tab = next;
        if (next === "weather") disarmCatastrophe();
    }
    const meteorArmed = $derived($armedCatastropheStore === "meteor");
    const downpourArmed = $derived($armedCatastropheStore === "downpour");
    const fireArmed = $derived($armedCatastropheStore === "fire");
    const drainArmed = $derived($armedCatastropheStore === "drain");
    // The size shown is that of the armed catastrophe, and stays that of the last one armed.
    let sized = $state<"meteor" | "downpour" | "fire" | "drain">("meteor");
    $effect(() => {
        if ($armedCatastropheStore !== undefined) sized = $armedCatastropheStore;
    });

    // Escape only matters while something is armed: the listener lives exactly that long.
    function onKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") disarmCatastrophe();
    }
    $effect(() => {
        if ($armedCatastropheStore === undefined) return;
        window.addEventListener("keydown", onKeydown);
        return () => window.removeEventListener("keydown", onKeydown);
    });

    onDestroy(disarmCatastrophe);
</script>

{#if shown}
    <div class="pointer-events-auto flex flex-col items-start gap-1 text-xs" data-testid="catastrophe-widget">
        <div class="flex gap-1 rounded-full bg-contrast/80 p-1 backdrop-blur" role="tablist">
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
            <div class="rounded-xl bg-contrast/80 p-2 backdrop-blur" role="tabpanel">
                <WeatherTab />
            </div>
        {:else}
            <div
                class="pointer-events-auto flex items-center gap-3 rounded-full bg-contrast/80 py-1 pe-3 ps-1 text-xs backdrop-blur"
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
                    <PixelIcon name="meteor" size={16} />
                    <span>{$LL.actionbar.catastrophe.meteor()}</span>
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
                {#if sized === "downpour"}
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
                    <span class="whitespace-nowrap" data-testid="catastrophe-drain-size"
                        >{$LL.actionbar.catastrophe.drainSize()}</span
                    >
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
                <span class="text-white/60">
                    {downpourArmed || drainArmed
                        ? $LL.actionbar.catastrophe.downpourArmedHelp()
                        : meteorArmed || fireArmed
                          ? $LL.actionbar.catastrophe.armedHelp()
                          : $LL.actionbar.catastrophe.idleHelp()}
                </span>
            </div>
        {/if}
    </div>
{/if}
