<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { shownWeatherForecast } from "../../Phaser/Game/Weather/RealWeatherClient";
    import { FORECAST_HOURS } from "../../Phaser/Game/Weather/WeatherForecast";
    import { nightDateStore } from "../../Stores/NightStore";
    import { weatherBannerStore } from "../../Stores/WeatherBannerStore";
    import WeatherIcon from "../Menu/WeatherIcon.svelte";
    import { weatherName } from "../Menu/WeatherName";
    import { IconX } from "@wa-icons";

    // Read again at each tick of the game clock (every second): a saved or tried weather shows within a second.
    const cells = $derived(
        $weatherBannerStore && $nightDateStore
            ? shownWeatherForecast(
                  gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings,
                  $nightDateStore,
              )
            : [],
    );
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
        {#each cells as cell, index (index)}
            <div
                class="flex items-center gap-1"
                role="img"
                aria-label={$LL.actionbar.weatherBanner.cell({
                    when: when(index),
                    weather: cell.weather
                        ? weatherName($LL.mapEditor.settings.weather, cell.weather)
                        : $LL.actionbar.weatherBanner.unknown(),
                })}
                data-testid="weather-banner-cell"
            >
                <span class="text-white/60">{when(index)}</span>
                {#if cell.weather}
                    <WeatherIcon icon={cell.weather} size={16} />
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
