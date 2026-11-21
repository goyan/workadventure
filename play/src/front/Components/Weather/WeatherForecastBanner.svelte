<script lang="ts">
    import type { WeatherType } from "@workadventure/map-editor";
    import type { ForecastCell } from "@wa/front/Phaser/Game/Weather/WeatherForecast";
    import {
        chosenPlaceForecast,
        chosenPlaceStore,
        chosenWeatherStateStore,
    } from "@wa/front/Phaser/Game/Weather/ChosenPlaceWeather";
    import { weatherLook } from "@wa/front/Components/Menu/WeatherName";
    import { realWeatherAt } from "@wa/common/RealWeather";
    import { compassPointOf, windArrowOf } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import type { WindArrow } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownMapPlace, shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { nightDateStore } from "../../Stores/NightStore";
    import { fireConditionsStore } from "../../Stores/FireConditionsStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import { nowCellWithConditions } from "../../Phaser/Game/Weather/ManualConditions";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import WeatherCard from "./WeatherCard.svelte";
    import WindArrowIcon from "./WindArrowIcon.svelte";
    import { IconDeviceDesktop, IconWorld, IconX } from "@wa-icons";

    // Read again at each tick of the game clock (every second): a saved or tried weather or town shows within a
    // second (the map settings are changed in place, so they cannot be followed by themselves).
    function mapSettings() {
        return gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings;
    }
    const forecast = $derived(
        $weatherBannerStore && $nightDateStore ? shownWeatherForecast(mapSettings(), $nightDateStore) : [],
    );
    // Now goes by the conditions of the room: its heat and wind when a player set them by hand, its humidity.
    const now = $derived(forecast.length > 0 ? nowCellWithConditions(forecast[0], $fireConditionsStore) : undefined);
    const cells = $derived(now ? [now.cell, ...forecast.slice(1)] : forecast);
    /** The town of the map (the place tried, if any) without its region and country; Paris by default. */
    const city = $derived.by(() => {
        if (!$weatherBannerStore || !$nightDateStore) return "";
        return shownMapPlace(mapSettings())?.name.split(",")[0]?.trim() || $LL.actionbar.weatherBanner.defaultCity();
    });

    /**
     * This player's own weather: that of the city they chose on their clock (NightMode.World), beside the weather of
     * the server, the same for everyone. None while they follow the server.
     */
    const mine = $derived.by(() => {
        const place = $chosenPlaceStore;
        const known = $chosenWeatherStateStore;
        if (!place || !$nightDateStore || !$weatherBannerStore) return undefined;
        const same = known.place?.latitude === place.latitude && known.place?.longitude === place.longitude;
        const state = same ? known.state : { status: "pending" as const };
        // The humidity of the quarter hour under way at that city, which its frost goes by; none while not known.
        const humidity =
            state.status === "known" ? realWeatherAt(state.slots, $nightDateStore.getTime())?.humidity : undefined;
        return {
            city: place.name.split(",")[0]?.trim() || place.name,
            // A point far from any city: its coordinates on the chip, the nearest city and how far on the card.
            longCity: place.longName ?? (place.name.split(",")[0]?.trim() || place.name),
            cells: chosenPlaceForecast(place, state, $nightDateStore),
            humidity,
        };
    });

    /** The full brief open, or only the chip (the default); kept in the browser. */
    const OPEN_KEY = "weatherCardsOpen";
    let open = $state(readOpen());

    function readOpen(): boolean {
        try {
            return localStorage.getItem(OPEN_KEY) === "true";
        } catch {
            return false;
        }
    }

    function toggle(): void {
        open = !open;
        try {
            localStorage.setItem(OPEN_KEY, String(open));
        } catch {
            // The choice is only lost at the next visit.
        }
    }

    function chipLook(cell: ForecastCell | undefined): WeatherType | undefined {
        return cell?.weather ? weatherLook(cell.weather, cell.cloudiness).icon : undefined;
    }

    function chipArrow(cell: ForecastCell | undefined): WindArrow | undefined {
        if (cell?.windSpeed === undefined || cell.windFrom === undefined) return undefined;
        const point = compassPointOf(cell.windFrom);
        return point ? windArrowOf(point) : undefined;
    }
</script>

{#snippet glance(name: string, cell: ForecastCell | undefined, kind: "server" | "local" | undefined, testid: string)}
    <!-- At a glance: whose weather (a globe for the server's, a computer for this player's own), the town, the weather
         of now and an arrow to where the wind goes. The full brief opens on a click. -->
    {@const look = chipLook(cell)}
    {@const arrow = chipArrow(cell)}
    <span class="flex items-center gap-1" data-testid={testid}>
        {#if kind === "server"}
            <IconWorld font-size="12" class="text-white/70" />
        {:else if kind === "local"}
            <IconDeviceDesktop font-size="12" class="text-white/70" />
        {/if}
        <span class="font-bold">{name}</span>
        {#if look}<WeatherIcon icon={look} size={16} />{/if}
        {#if arrow}<WindArrowIcon {arrow} size={12} testid="{testid}-wind" />{/if}
    </span>
{/snippet}

{#if cells.length > 0}
    <div
        class="pointer-events-auto flex flex-col items-end gap-2"
        role="group"
        aria-label={$LL.actionbar.weatherBanner.label()}
        data-testid="weather-banner"
    >
        <div class="flex h-8 items-center gap-1 rounded-full bg-contrast/80 py-1 pe-1 ps-2 text-xs backdrop-blur">
            <button
                type="button"
                class="flex items-center gap-3 rounded-full px-1 hover:bg-white/10"
                aria-expanded={open}
                aria-label={open ? $LL.actionbar.weatherBanner.fold() : $LL.actionbar.weatherBanner.unfold()}
                onclick={toggle}
                data-testid="weather-chip"
            >
                {@render glance(city, cells[0], mine ? "server" : undefined, "weather-chip-server")}
                {#if mine}
                    {@render glance(mine.city, mine.cells[0], "local", "weather-chip-local")}
                {/if}
            </button>
            <button
                type="button"
                class="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
                aria-label={$LL.actionbar.weatherBanner.close()}
                onclick={() => weatherBannerStore.set(false)}
            >
                <IconX font-size="14" />
            </button>
        </div>
        {#if open}
            <WeatherCard
                {city}
                kind={mine ? "server" : undefined}
                tag={$LL.actionbar.weatherBanner.server()}
                {cells}
                now={now ? { humidity: now.humidity, manual: now.manual } : undefined}
                testid="weather-card-server"
            />
            {#if mine}
                <WeatherCard
                    city={mine.longCity}
                    kind="local"
                    tag={$LL.actionbar.weatherBanner.local()}
                    cells={mine.cells}
                    now={{ humidity: mine.humidity, manual: false }}
                    testid="weather-card-local"
                />
            {/if}
        {/if}
    </div>
{/if}
