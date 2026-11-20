<script lang="ts">
    import type { WeatherType } from "@workadventure/map-editor";
    import { LL } from "@wa/i18n/i18n-svelte";
    import { FORECAST_HOURS } from "@wa/front/Phaser/Game/Weather/WeatherForecast";
    import type { ForecastCell } from "@wa/front/Phaser/Game/Weather/WeatherForecast";
    import { compassPointOf, windArrowOf } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import type { CompassPoint } from "@wa/front/Phaser/Game/Weather/WindDirection";
    import WeatherIcon from "@wa/front/Components/Menu/WeatherIcon.svelte";
    import { weatherLook, weatherName } from "@wa/front/Components/Menu/WeatherName";
    import WindArrowIcon from "./WindArrowIcon.svelte";
    import { IconDeviceDesktop, IconWorld } from "@wa-icons";

    interface Props {
        /** The town the weather is of. */
        city: string;
        /**
         * Whose weather it is, shown when both are: the server's, the same for everyone (a globe), or this player's
         * own, of the city chosen on their clock (a computer). `tag` names it for the tooltip and screen readers.
         */
        kind?: "server" | "local";
        tag?: string;
        /** Now, in one hour and in four hours. */
        cells: ForecastCell[];
        /** The humidity of the air now, and whether the conditions of now were set by hand. */
        now?: { humidity: number | undefined; manual: boolean };
        testid: string;
    }

    let { city, kind, tag, cells, now, testid }: Props = $props();

    /** The colours of the card, from the weather of now: golden in the sun, blue under the rain, grey in the fog. */
    const TONES: Record<string, string> = {
        clear: "from-amber-300/40 to-sky-500/30",
        automatic: "from-sky-300/30 to-slate-500/30",
        cloudy: "from-slate-300/30 to-slate-600/40",
        rain: "from-sky-600/40 to-slate-800/40",
        storm: "from-indigo-700/50 to-slate-900/60",
        snow: "from-slate-100/40 to-sky-200/30",
        fog: "from-gray-300/30 to-gray-600/40",
    };
    const tone = $derived.by(() => {
        const first = cells[0];
        const look = first ? shown(first) : undefined;
        return (look && TONES[look.icon]) ?? "from-slate-500/30 to-slate-700/30";
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

<div
    class="w-60 rounded-xl border border-white/10 bg-contrast/80 bg-gradient-to-br p-2 text-xs backdrop-blur {tone}"
    role="group"
    aria-label={city}
    data-testid={testid}
>
    <div class="flex items-center gap-2">
        {#if kind}
            <span
                class="flex shrink-0 rounded-full bg-white/15 p-1 text-white/90"
                title={tag}
                aria-label={tag}
                role="img"
                data-testid="{testid}-kind"
                data-kind={kind}
            >
                {#if kind === "server"}
                    <IconWorld font-size="14" />
                {:else}
                    <IconDeviceDesktop font-size="14" />
                {/if}
            </span>
        {/if}
        <span class="truncate font-bold" data-testid="{testid}-city">{city}</span>
        {#if now?.manual}
            <span class="rounded bg-white/20 px-1" data-testid="weather-banner-manual"
                >{$LL.actionbar.weatherBanner.manual()}</span
            >
        {/if}
    </div>
    <div class="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
        {#each cells as cell, index (index)}
            {@const look = shown(cell)}
            <div
                class={index === 0
                    ? "flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                    : "flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5"}
                role="img"
                aria-label={label(cell, index, look)}
                data-testid="weather-banner-cell"
            >
                <span class="text-white/60">{when(index)}</span>
                {#if look}
                    <WeatherIcon icon={look.icon} size={index === 0 ? 32 : 16} />
                {:else}
                    <span class="w-4 text-center text-white/60">?</span>
                {/if}
                {#if cell.temperature !== undefined}
                    <!-- In the pixel font, a 5 reads as an S and a 7 as a 1: the temperature uses the system font. -->
                    <span
                        class="tabular-nums {index === 0 ? 'text-2xl font-bold' : ''}"
                        style:font-family="var(--ui-font-system)">{Math.round(cell.temperature)}°</span
                    >
                {/if}
                {#if showsWind(cell, index)}
                    {@const point = windPoint(cell, index)}
                    <!-- Wind for now only: three of them would not fit the banner on a narrow screen. -->
                    {#if point}
                        {@const arrow = windArrowOf(point)}
                        <!-- An arrow to where the wind goes, north up as on the map, in place of the gusts: it says
                             there is wind as well, and both would crowd the banner. -->
                        <WindArrowIcon {arrow} class="ms-1" testid="weather-banner-wind-arrow" />
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
    </div>
</div>
