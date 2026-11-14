<script lang="ts">
    import type { WeatherLocation } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { searchPlaces } from "../../Phaser/Game/Weather/RealWeatherClient";

    interface Props {
        location: WeatherLocation | undefined;
    }

    let { location = $bindable() }: Props = $props();

    let query = $state("");
    let results = $state<WeatherLocation[]>([]);
    let status = $state<"idle" | "searching" | "empty" | "error">("idle");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    /** Waits for a pause in the typing, then asks for the towns: one request per word typed, not per letter. */
    function onInput(): void {
        clearTimeout(timer);
        controller?.abort();
        const typed = query.trim();
        if (typed.length < 2) {
            results = [];
            status = "idle";
            return;
        }
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
        location = place;
        query = "";
        results = [];
        status = "idle";
    }

    onDestroy(() => {
        clearTimeout(timer);
        controller?.abort();
    });
</script>

<div class="flex flex-col gap-2" data-testid="map-location">
    <span class="text-sm font-bold">{$LL.mapEditor.settings.weather.location.title()}</span>
    <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-white/80" data-testid="map-location-current">
            {location?.name ?? $LL.mapEditor.settings.weather.location.default()}
        </span>
        {#if location}
            <button
                type="button"
                class="shrink-0 text-xs text-white/60 underline hover:text-white"
                onclick={() => (location = undefined)}
                data-testid="map-location-reset">{$LL.mapEditor.settings.weather.location.reset()}</button
            >
        {/if}
    </div>
    <input
        type="search"
        class="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40"
        placeholder={$LL.mapEditor.settings.weather.location.search()}
        aria-label={$LL.mapEditor.settings.weather.location.search()}
        maxlength="100"
        bind:value={query}
        oninput={onInput}
        data-testid="map-location-search"
    />
    {#if results.length > 0}
        <ul class="flex flex-col gap-1" data-testid="map-location-results">
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
    <span class="text-xs text-white/50">{$LL.mapEditor.settings.weather.location.hint()}</span>
</div>
