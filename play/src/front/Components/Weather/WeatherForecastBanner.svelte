<script lang="ts">
    import type { WeatherType } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownMapPlace, shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { FORECAST_HOURS } from "../../Phaser/Game/Weather/WeatherForecast";
    import type { ForecastCell } from "../../Phaser/Game/Weather/WeatherForecast";
    import { compassPointOf, windArrowOf } from "../../Phaser/Game/Weather/WindDirection";
    import type { CompassPoint, WindArrow } from "../../Phaser/Game/Weather/WindDirection";
    import { nightDateStore } from "../../Stores/NightStore";
    import { fireConditionsStore } from "../../Stores/FireConditionsStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import { nowCellWithConditions } from "../../Phaser/Game/Weather/ManualConditions";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import { weatherLook, weatherName } from "../Menu/WeatherName";
    import { IconX } from "@wa-icons";

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

    function shown(cell: ForecastCell): { icon: WeatherType; name: WeatherType } | undefined {
        return cell.weather ? weatherLook(cell.weather, cell.cloudiness) : undefined;
    }

    /** The wind is shown for now only (see the markup); `cell.windSpeed` is narrowed for the template. */
    function showsWind(cell: ForecastCell, index: number): cell is ForecastCell & { windSpeed: number } {
        return index === 0 && cell.windSpeed !== undefined;
    }

    /** Where the wind of now comes from, given with its speed only (see `ForecastCell.windFrom`). */
    function windPoint(cell: ForecastCell, index: number): CompassPoint | undefined {
        return showsWind(cell, index) && cell.windFrom !== undefined ? compassPointOf(cell.windFrom) : undefined;
    }

    /** "NW 22 km/h", or "22 km/h" without a direction. */
    function windText(speed: number, point: CompassPoint | undefined): string {
        const shown = $LL.actionbar.weatherBanner.windSpeed({ speed });
        return point ? `${$LL.actionbar.weatherBanner.windPoint[point]()} ${shown}` : shown;
    }

    function windArrowStyle(arrow: WindArrow): string {
        return `rotate(${arrow.quarterTurns * 90}deg)`;
    }

    function label(cell: ForecastCell, index: number, look: { name: WeatherType } | undefined): string {
        const weather = look
            ? weatherName($LL.mapEditor.settings.weather, look.name)
            : $LL.actionbar.weatherBanner.unknown();
        if (!showsWind(cell, index)) return $LL.actionbar.weatherBanner.cell({ when: when(index), weather });
        const point = windPoint(cell, index);
        return point
            ? $LL.actionbar.weatherBanner.cellWithWindFrom({
                  when: when(index),
                  weather,
                  from: $LL.actionbar.weatherBanner.windFrom[point](),
                  speed: cell.windSpeed,
              })
            : $LL.actionbar.weatherBanner.cellWithWind({ when: when(index), weather, speed: cell.windSpeed });
    }

    function when(index: number): string {
        const hours = FORECAST_HOURS[index] ?? 0;
        return hours === 0 ? $LL.actionbar.weatherBanner.now() : $LL.actionbar.weatherBanner.inHours({ hours });
    }
</script>

{#if cells.length > 0}
    <div
        class="pointer-events-auto flex items-center gap-3 rounded-full bg-contrast/80 py-1 pe-1 ps-3 text-xs backdrop-blur"
        role="group"
        aria-label={$LL.actionbar.weatherBanner.label()}
        data-testid="weather-banner"
    >
        <span class="font-bold" data-testid="weather-banner-city">{city}</span>
        {#if now?.manual}
            <span class="rounded bg-white/20 px-1" data-testid="weather-banner-manual"
                >{$LL.actionbar.weatherBanner.manual()}</span
            >
        {/if}
        {#each cells as cell, index (index)}
            {@const look = shown(cell)}
            <div
                class="flex items-center gap-1"
                role="img"
                aria-label={label(cell, index, look)}
                data-testid="weather-banner-cell"
            >
                <span class="text-white/60">{when(index)}</span>
                {#if look}
                    <WeatherIcon icon={look.icon} size={16} />
                {:else}
                    <span class="w-4 text-center text-white/60">?</span>
                {/if}
                {#if cell.temperature !== undefined}
                    <!-- In the pixel font, a 5 reads as an S and a 7 as a 1: the temperature uses the system font. -->
                    <span class="tabular-nums" style:font-family="var(--ui-font-system)"
                        >{Math.round(cell.temperature)}°</span
                    >
                {/if}
                {#if showsWind(cell, index)}
                    {@const point = windPoint(cell, index)}
                    <!-- Wind for now only: three of them would not fit the banner on a narrow screen. -->
                    {#if point}
                        {@const arrow = windArrowOf(point)}
                        <!-- An arrow to where the wind goes, north up as on the map, in place of the gusts: it says
                             there is wind as well, and both would crowd the banner. -->
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            shape-rendering="crispEdges"
                            aria-hidden="true"
                            class="ms-1 shrink-0"
                            style:transform={windArrowStyle(arrow)}
                            data-towards={arrow.towards}
                            data-testid="weather-banner-wind-arrow"
                        >
                            <g fill="#cfd8e3">
                                {#if arrow.diagonal}
                                    <!-- pointing north-east: a two-pixel head in the corner and a stepped shaft -->
                                    <rect x="7" y="2" width="7" height="2" />
                                    <rect x="12" y="2" width="2" height="7" />
                                    {#each [0, 1, 2, 3, 4, 5, 6, 7] as step (step)}
                                        <rect x={3 + step} y={12 - step} width="2" height="1" />
                                    {/each}
                                {:else}
                                    <!-- pointing north: a head of four rows and a shaft two pixels wide -->
                                    <rect x="7" y="1" width="2" height="1" />
                                    <rect x="6" y="2" width="4" height="1" />
                                    <rect x="5" y="3" width="6" height="1" />
                                    <rect x="4" y="4" width="8" height="1" />
                                    <rect x="7" y="5" width="2" height="10" />
                                {/if}
                            </g>
                        </svg>
                    {:else}
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            shape-rendering="crispEdges"
                            aria-hidden="true"
                            class="ms-1 shrink-0"
                            data-testid="weather-banner-wind-icon"
                        >
                            <!-- three gusts with a curl at their end, in the 16x16 pixel art of the weather icons -->
                            <g fill="#cfd8e3">
                                <rect x="1" y="4" width="10" height="1" />
                                <rect x="11" y="2" width="1" height="2" />
                                <rect x="9" y="1" width="2" height="1" />
                                <rect x="1" y="8" width="13" height="1" />
                                <rect x="14" y="6" width="1" height="2" />
                                <rect x="12" y="5" width="2" height="1" />
                                <rect x="3" y="12" width="8" height="1" />
                                <rect x="11" y="13" width="1" height="1" />
                                <rect x="9" y="14" width="2" height="1" />
                            </g>
                        </svg>
                    {/if}
                    <span
                        class="tabular-nums"
                        style:font-family="var(--ui-font-system)"
                        data-testid="weather-banner-wind">{windText(cell.windSpeed, point)}</span
                    >
                {/if}
                {#if index === 0 && now?.humidity !== undefined}
                    <!-- The humidity of the air, for now only: with the heat and the wind it says whether fire takes. -->
                    <span
                        class="tabular-nums text-white/80"
                        style:font-family="var(--ui-font-system)"
                        data-testid="weather-banner-humidity"
                        >{$LL.actionbar.weatherBanner.humidity({ value: Math.round(now.humidity) })}</span
                    >
                {/if}
            </div>
        {/each}
        <button
            type="button"
            class="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
            aria-label={$LL.actionbar.weatherBanner.close()}
            onclick={() => weatherBannerStore.set(false)}
        >
            <IconX font-size="14" />
        </button>
    </div>
{/if}
