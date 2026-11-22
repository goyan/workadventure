<script lang="ts">
    import { WeatherType } from "@workadventure/map-editor";
    import type { ForecastCell } from "@wa/front/Phaser/Game/Weather/WeatherForecast";
    import {
        chosenPlaceForecast,
        chosenPlaceStore,
        chosenWeatherStateStore,
    } from "@wa/front/Phaser/Game/Weather/ChosenPlaceWeather";
    import { weatherLook, weatherName } from "@wa/front/Components/Menu/WeatherName";
    import { canEditMapWeather } from "@wa/front/Phaser/Game/Weather/MapWeatherRights";
    import { appliedPlaceStore, placeToMapState } from "@wa/front/Phaser/Game/Weather/PlaceToMap";
    import { realWeatherAt } from "@wa/common/RealWeather";
    import { compassPointOf, windArrowOf } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import type { WindArrow } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownMapPlace, shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { nightDateStore } from "../../Stores/NightStore";
    import { fireConditionsStore } from "../../Stores/FireConditionsStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import { mapEditorActivated } from "../../Stores/MenuStore";
    import { nowCellWithConditions } from "../../Phaser/Game/Weather/ManualConditions";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import WeatherCard from "./WeatherCard.svelte";
    import WindArrowIcon from "./WindArrowIcon.svelte";
    import PlaceToMapModal from "./PlaceToMapModal.svelte";
    import { canRevertMapPlace, revertMapPlace } from "./placeToMapActions";
    import { modals } from "@wa-modals";
    import { IconArrowBackUp, IconDeviceDesktop, IconWorld, IconWorldUpload, IconX } from "@wa-icons";

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
            // A town without its region and country; a point far from any city whole ("Auckland 4,000 km").
            city: place.longName ? place.name : place.name.split(",")[0]?.trim() || place.name,
            // A point far from any city: its coordinates on the chip, the nearest city and how far on the card.
            longCity: place.longName ?? (place.name.split(",")[0]?.trim() || place.name),
            cells: chosenPlaceForecast(place, state, $nightDateStore),
            humidity,
        };
    });

    /**
     * The button of this player's own card that makes the map follow their place, for everyone: what it can do now
     * (read again at each tick, with the right to edit the map and the weather saved in the map, not a tried one).
     */
    const toMap = $derived.by(() => {
        const place = $chosenPlaceStore;
        const known = $chosenWeatherStateStore;
        if (!place || !$nightDateStore) return undefined;
        const scene = gameManager.getCurrentGameScene();
        const saved = mapSettings();
        const same = known.place?.latitude === place.latitude && known.place?.longitude === place.longitude;
        return {
            place,
            state: placeToMapState({
                canEdit: $mapEditorActivated && canEditMapWeather(scene),
                place,
                mapPlace: saved?.weatherLocation,
                mapWeather: saved?.weather,
                data: same ? known.state : { status: "pending" },
            }),
        };
    });

    /** "Back to …" on the card of the map, for the player who made it follow their place, while it still does. */
    const revert = $derived.by(() => {
        const applied = $appliedPlaceStore;
        if (!applied || !$nightDateStore || !$mapEditorActivated || !canRevertMapPlace()) return undefined;
        return {
            place: applied.before.location?.name.split(",")[0]?.trim() || $LL.actionbar.weatherBanner.defaultCity(),
        };
    });
    let reverting = $state(false);
    let revertFailed = $state(false);

    function openPlaceToMap(): void {
        const place = toMap?.place;
        if (!place || toMap?.state !== "ready") return;
        const saved = mapSettings();
        const weather = saved?.weather ?? WeatherType.Clear;
        modals.open(PlaceToMapModal, {
            place,
            mapPlace: city,
            mapWeather: weather === WeatherType.Real ? undefined : weatherName($LL.mapEditor.settings.weather, weather),
            manual: $fireConditionsStore?.manual ?? false,
        });
    }

    function bringBack(): void {
        if (reverting) return;
        reverting = true;
        revertFailed = false;
        revertMapPlace()
            .catch((error: unknown) => {
                console.error("The map could not go back to its place", error);
                revertFailed = true;
            })
            .finally(() => {
                reverting = false;
            });
    }

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

{#snippet toMapFooter()}
    <!-- Makes the map follow this place, for everyone; says why it cannot when it cannot. -->
    {#if toMap}
        {@const t = $LL.actionbar.placeToMap}
        {@const hint =
            toMap.state === "ready"
                ? t.hint()
                : toMap.state === "already"
                  ? t.already()
                  : toMap.state === "noRight"
                    ? t.noRight()
                    : toMap.state === "pending"
                      ? t.pending()
                      : t.noData()}
        <div class="mt-2 flex flex-col items-start gap-1">
            <button
                type="button"
                class="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-white/10"
                disabled={toMap.state !== "ready"}
                title={hint}
                data-testid="place-to-map"
                data-state={toMap.state}
                onclick={openPlaceToMap}
            >
                <IconWorldUpload font-size="14" />
                <span>{toMap.state === "already" ? t.already() : t.apply()}</span>
            </button>
            {#if toMap.state !== "ready" && toMap.state !== "already"}
                <span class="text-white/70" data-testid="place-to-map-why">{hint}</span>
            {/if}
        </div>
    {/if}
{/snippet}

{#snippet revertFooter()}
    {#if revert}
        <div class="mt-2 flex flex-col items-start gap-1">
            <button
                type="button"
                class="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/20 disabled:opacity-60"
                disabled={reverting}
                title={$LL.actionbar.placeToMap.revertHint()}
                data-testid="place-to-map-revert"
                onclick={bringBack}
            >
                <IconArrowBackUp font-size="14" />
                <span>{$LL.actionbar.placeToMap.revert({ place: revert.place })}</span>
            </button>
            {#if revertFailed}
                <span class="text-white/80" role="alert">{$LL.actionbar.placeToMap.error()}</span>
            {/if}
        </div>
    {/if}
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
                footer={revert ? revertFooter : undefined}
            />
            {#if mine}
                <WeatherCard
                    city={mine.longCity}
                    kind="local"
                    tag={$LL.actionbar.weatherBanner.local()}
                    cells={mine.cells}
                    now={{ humidity: mine.humidity, manual: false }}
                    testid="weather-card-local"
                    footer={toMap ? toMapFooter : undefined}
                />
            {/if}
        {/if}
    </div>
{/if}
