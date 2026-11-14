<script lang="ts">
    import { WeatherType } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownMapPlace, shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { FORECAST_HOURS } from "../../Phaser/Game/Weather/WeatherForecast";
    import type { ForecastCell } from "../../Phaser/Game/Weather/WeatherForecast";
    import { nightDateStore } from "../../Stores/NightStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import { weatherName } from "../Menu/WeatherName";
    import { IconX } from "@wa-icons";

    /** From this cloudiness, the banner shows a cloud alone (an overcast sky). */
    const OVERCAST_CLOUDINESS = 0.8;

    // Read again at each tick of the game clock (every second): a saved or tried weather shows within a second.
    const settings = $derived(
        $weatherBannerStore && $nightDateStore
            ? gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings
            : undefined,
    );
    const cells = $derived(
        $weatherBannerStore && $nightDateStore ? shownWeatherForecast(settings, $nightDateStore) : [],
    );
    /** The town of the map (the place tried, if any) without its region and country; Paris by default. */
    const city = $derived(
        shownMapPlace(settings)?.name.split(",")[0]?.trim() || $LL.actionbar.weatherBanner.defaultCity(),
    );
    /** A clear sky with clouds is shown Cloudy: the sun behind a cloud, or a cloud alone when overcast. */
    function shown(cell: ForecastCell): { icon: WeatherType; name: WeatherType } | undefined {
        if (!cell.weather) return undefined;
        if (cell.weather !== WeatherType.Clear || !cell.cloudiness) return { icon: cell.weather, name: cell.weather };
        return {
            icon: cell.cloudiness >= OVERCAST_CLOUDINESS ? WeatherType.Cloudy : WeatherType.Automatic,
            name: WeatherType.Cloudy,
        };
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
                aria-label={$LL.actionbar.weatherBanner.cell({
                    when: when(index),
                    weather: look
                        ? weatherName($LL.mapEditor.settings.weather, look.name)
                        : $LL.actionbar.weatherBanner.unknown(),
                })}
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
