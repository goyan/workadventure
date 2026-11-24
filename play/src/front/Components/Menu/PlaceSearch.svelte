<script lang="ts">
    import type { WeatherLocation } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { searchPlaces } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { inputFormFocusStore } from "../../Stores/UserInputStore";

    interface Props {
        /** The place chosen now, shown in the field until the player types another one. */
        shown: string;
        /** A town chosen in the list. */
        onchoose: (place: WeatherLocation) => void;
        /** Of the field, and of the list of the towns found. */
        testid: string;
        resultsTestid: string;
    }

    let { shown, onchoose, testid, resultsTestid }: Props = $props();

    let query = $state("");
    let focused = false;
    let results = $state<WeatherLocation[]>([]);
    let status = $state<"idle" | "searching" | "empty" | "error">("idle");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    // The place chosen elsewhere (a click on the map, another panel) shows in the field, without a search.
    $effect(() => {
        query = shown;
        stop();
    });

    function stop(): void {
        clearTimeout(timer);
        controller?.abort();
        results = [];
        status = "idle";
    }

    /**
     * Waits for a pause in the typing, then asks for the towns: one request per word typed, not per letter. Only the
     * text typed is sent (to the pusher, which asks the geocoding of Open-Meteo).
     */
    function onInput(): void {
        stop();
        const typed = query.trim();
        if (typed.length < 2) return;
        timer = setTimeout(() => {
            const asking = new AbortController();
            controller = asking;
            status = "searching";
            searchPlaces(typed, asking.signal)
                .then((found) => {
                    if (asking.signal.aborted) return;
                    results = found;
                    status = found.length === 0 ? "empty" : "idle";
                })
                .catch(() => {
                    if (asking.signal.aborted) return;
                    results = [];
                    status = "error";
                });
        }, 300);
    }

    function choose(place: WeatherLocation): void {
        stop();
        query = place.name.split(",")[0]?.trim() || place.name;
        onchoose(place);
    }

    /** Enter takes the first town of the list; Escape closes the list, and only the list. */
    function onKeydown(event: KeyboardEvent): void {
        if (event.key === "Enter") {
            const first = results[0];
            if (first) {
                event.preventDefault();
                choose(first);
            }
        } else if (event.key === "Escape" && (results.length > 0 || status !== "idle")) {
            event.stopPropagation();
            stop();
        }
    }

    // While the player types, the keys move nothing in the game.
    function setFocused(value: boolean): void {
        focused = value;
        inputFormFocusStore.set(value);
    }

    onDestroy(() => {
        stop();
        if (focused) inputFormFocusStore.set(false);
    });
</script>

<div class="flex flex-col gap-1">
    <input
        type="search"
        class="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
        placeholder={$LL.mapEditor.settings.weather.location.search()}
        aria-label={$LL.mapEditor.settings.weather.location.search()}
        maxlength="100"
        bind:value={query}
        oninput={onInput}
        onkeydown={onKeydown}
        onfocus={() => setFocused(true)}
        onblur={() => setFocused(false)}
        data-testid={testid}
    />
    {#if results.length > 0}
        <ul class="m-0 flex list-none flex-col gap-1 p-0" data-testid={resultsTestid}>
            {#each results as place (`${place.latitude},${place.longitude},${place.name}`)}
                <li>
                    <button
                        type="button"
                        class="w-full rounded-lg bg-black/30 px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                        onclick={() => choose(place)}>{place.name}</button
                    >
                </li>
            {/each}
        </ul>
    {:else if status === "searching"}
        <span class="text-xs text-white/50">{$LL.mapEditor.settings.weather.location.searching()}</span>
    {:else if status === "empty"}
        <span class="text-xs text-white/50">{$LL.mapEditor.settings.weather.location.noResult()}</span>
    {:else if status === "error"}
        <span class="text-xs text-white/50">{$LL.mapEditor.settings.weather.location.error()}</span>
    {/if}
</div>
