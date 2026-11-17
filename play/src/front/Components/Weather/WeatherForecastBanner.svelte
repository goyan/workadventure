<script lang="ts">
    import type { WeatherType } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownMapPlace, shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { FORECAST_HOURS } from "../../Phaser/Game/Weather/WeatherForecast";
    import type { ForecastCell } from "../../Phaser/Game/Weather/WeatherForecast";
    import { nightDateStore } from "../../Stores/NightStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import { weatherLook, weatherName } from "../Menu/WeatherName";
    import { IconX } from "@wa-icons";

    // Read again at each tick of the game clock (every second): a saved or tried weather or town shows within a
    // second (the map settings are changed in place, so they cannot be followed by themselves).
    function mapSettings() {
        return gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings;
    }
    const cells = $derived(
        $weatherBannerStore && $nightDateStore ? shownWeatherForecast(mapSettings(), $nightDateStore) : [],
    );
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

    function label(cell: ForecastCell, index: number, look: { name: WeatherType } | undefined): string {
        const weather = look
            ? weatherName($LL.mapEditor.settings.weather, look.name)
            : $LL.actionbar.weatherBanner.unknown();
        return showsWind(cell, index)
            ? $LL.actionbar.weatherBanner.cellWithWind({ when: when(index), weather, speed: cell.windSpeed })
            : $LL.actionbar.weatherBanner.cell({ when: when(index), weather });
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
                    <!-- Wind for now only: three of them would not fit the banner on a narrow screen. -->
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
                    <span
                        class="tabular-nums"
                        style:font-family="var(--ui-font-system)"
                        data-testid="weather-banner-wind"
                        >{$LL.actionbar.weatherBanner.windSpeed({ speed: cell.windSpeed })}</span
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
