<script lang="ts">
    import { PARIS_LATITUDE, PARIS_LONGITUDE } from "@workadventure/map-editor";
    import type { WeatherLocation } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { isPointName, mapPlaceNames } from "../../Phaser/Game/Weather/MapPlaceName";
    import { mapLocationOf } from "../../Phaser/Game/Weather/PlaceToMap";
    import { placeOfPoint } from "../../Phaser/Game/Night/WorldDaylight";
    import type { WorldPoint } from "../../Phaser/Game/Night/WorldDaylight";
    import { pointWords } from "../../Phaser/Game/Night/PointWords";
    import { nightDateStore } from "../../Stores/NightStore";
    import WorldMapPicker from "../WorldMap/WorldMapPicker.svelte";
    import PlaceSearch from "./PlaceSearch.svelte";

    interface Props {
        location: WeatherLocation | undefined;
    }

    let { location = $bindable() }: Props = $props();

    /** A town with its region and country; a point of the world named as a player's own point is. */
    const current = $derived(
        location
            ? isPointName(location.name)
                ? (mapPlaceNames(location, pointWords)?.long ?? location.name)
                : location.name
            : undefined,
    );
    /** In the search field: the town alone, or the point by its long name. */
    const shown = $derived(location ? (mapPlaceNames(location, pointWords)?.long ?? location.name) : "");

    /** A point clicked on the map of the world: saved as the button "Apply to the map" saves a place. */
    function pick(point: WorldPoint): void {
        location = mapLocationOf(placeOfPoint(point, pointWords()));
    }
</script>

<div class="flex flex-col gap-2" data-testid="map-location">
    <span class="text-sm font-bold">{$LL.mapEditor.settings.weather.location.title()}</span>
    <div class="flex items-center justify-between gap-2">
        <span class="text-sm text-white/80" data-testid="map-location-current">
            {current ?? $LL.mapEditor.settings.weather.location.default()}
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
    <PlaceSearch
        {shown}
        onchoose={(place) => (location = place)}
        testid="map-location-search"
        resultsTestid="map-location-results"
    />
    <!-- Or a point of the world, anywhere: the field and the map show the same place. -->
    <WorldMapPicker
        marker={location ?? { latitude: PARIS_LATITUDE, longitude: PARIS_LONGITUDE }}
        date={$nightDateStore}
        onpick={pick}
        testid="map-location-map"
        label={$LL.mapEditor.settings.weather.location.map()}
    />
    <span class="text-xs text-white/50">{$LL.mapEditor.settings.weather.location.hint()}</span>
</div>
