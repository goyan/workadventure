<script lang="ts">
    import { DEFAULT_AUTO_WEATHER, Season, Weather, WeatherType } from "@workadventure/map-editor";
    import type { AutoWeatherFrequency, AutoWeatherSettings, WeatherLocation } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { mapEditorActivated } from "../../Stores/MenuStore";
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import { autoWeatherAt, autoWeatherChanges } from "../../Phaser/Game/Weather/WeatherSchedule";
    import { seasonAt } from "../../Phaser/Game/Nature/SeasonClock";
    import ButtonState from "../Input/ButtonState.svelte";
    import InputCheckbox from "../Input/InputCheckbox.svelte";
    import { realWeatherStore, weatherPreviewStore } from "../../Phaser/Game/Weather/RealWeatherClient";
    import MapLocationPicker from "./MapLocationPicker.svelte";
    import SegmentedControl from "./SegmentedControl.svelte";
    import WeatherTiles from "./WeatherTiles.svelte";
    import { weatherName as sharedWeatherName } from "./WeatherName";

    type BadWeather = WeatherType.Rain | WeatherType.Storm | WeatherType.Snow | WeatherType.Fog;
    const BAD_WEATHERS: BadWeather[] = [WeatherType.Rain, WeatherType.Storm, WeatherType.Snow, WeatherType.Fog];

    const settings = gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings;
    const initialAuto: AutoWeatherSettings = settings?.weatherAuto ?? DEFAULT_AUTO_WEATHER;
    // Server time when the panel opens, the preview is computed from it.
    const openedAt = gameManager.getCurrentGameScene().getServerDate() ?? new Date();

    let weather = $state<WeatherType>(settings?.weather ?? WeatherType.Clear);
    let frequency = $state<AutoWeatherFrequency>(initialAuto.frequency);
    let included = $state<Record<BadWeather, boolean>>({
        [WeatherType.Rain]: initialAuto.include.includes(WeatherType.Rain),
        [WeatherType.Storm]: initialAuto.include.includes(WeatherType.Storm),
        [WeatherType.Snow]: initialAuto.include.includes(WeatherType.Snow),
        [WeatherType.Fog]: initialAuto.include.includes(WeatherType.Fog),
    });

    // Raw: the chosen place is replaced, never edited. Compared with the saved one by value: the same town found again is
    // a new object.
    function samePlace(a: WeatherLocation | undefined, b: WeatherLocation | undefined): boolean {
        return a?.name === b?.name && a?.latitude === b?.latitude && a?.longitude === b?.longitude;
    }
    let location = $state.raw<WeatherLocation | undefined>(settings?.weatherLocation);

    const autoInclude = $derived(BAD_WEATHERS.filter((w) => included[w]));

    // What is being tried shows at once, for this person only, until the panel closes (weatherPreviewStore).
    let saved = $state.raw({
        weather: settings?.weather ?? WeatherType.Clear,
        frequency: initialAuto.frequency,
        include: BAD_WEATHERS.filter((w) => initialAuto.include.includes(w)).join(),
        location: settings?.weatherLocation,
    });
    const changed = $derived(
        weather !== saved.weather ||
            frequency !== saved.frequency ||
            autoInclude.join() !== saved.include ||
            !samePlace(location, saved.location),
    );
    const placeRemoved = $derived(location === undefined && saved.location !== undefined);
    $effect(() => {
        weatherPreviewStore.set(
            changed
                ? { weather, weatherAuto: { frequency, include: autoInclude }, weatherLocation: location }
                : undefined,
        );
    });
    onDestroy(() => weatherPreviewStore.set(undefined));

    const tiles = $derived([
        {
            value: WeatherType.Automatic,
            label: $LL.mapEditor.settings.weather.automatic(),
            icon: WeatherType.Automatic,
        },
        { value: WeatherType.Clear, label: $LL.mapEditor.settings.weather.clear(), icon: WeatherType.Clear },
        { value: WeatherType.Rain, label: $LL.mapEditor.settings.weather.rain(), icon: WeatherType.Rain },
        { value: WeatherType.Storm, label: $LL.mapEditor.settings.weather.storm(), icon: WeatherType.Storm },
        { value: WeatherType.Snow, label: $LL.mapEditor.settings.weather.snow(), icon: WeatherType.Snow },
        { value: WeatherType.Fog, label: $LL.mapEditor.settings.weather.fog(), icon: WeatherType.Fog },
        { value: WeatherType.Real, label: $LL.mapEditor.settings.weather.real(), icon: WeatherType.Real },
    ]);
    const frequencies = $derived([
        { value: "calm" as AutoWeatherFrequency, label: $LL.mapEditor.settings.weather.auto.calm() },
        { value: "normal" as AutoWeatherFrequency, label: $LL.mapEditor.settings.weather.auto.normal() },
        { value: "stormy" as AutoWeatherFrequency, label: $LL.mapEditor.settings.weather.auto.stormy() },
    ]);

    function weatherName(w: WeatherType): string {
        return sharedWeatherName($LL.mapEditor.settings.weather, w);
    }

    function seasonName(season: Season): string {
        const labels = $LL.mapEditor.settings.weather.season;
        switch (season) {
            case Season.Winter:
                return labels.winter();
            case Season.Spring:
                return labels.spring();
            case Season.Summer:
                return labels.summer();
            default:
                return labels.autumn();
        }
    }

    const timeFormat = new Intl.DateTimeFormat("fr-FR", {
        timeZone: "Europe/Paris",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });

    const preview = $derived.by(() => {
        if (weather !== WeatherType.Automatic) return [];
        const auto: AutoWeatherSettings = { frequency, include: autoInclude };
        const changes = autoWeatherChanges(openedAt, auto, 2);
        const lines: string[] = [];
        const season = seasonName(seasonAt(openedAt));
        const current = weatherName(autoWeatherAt(openedAt, auto));
        const first = changes[0];
        lines.push(
            first
                ? $LL.mapEditor.settings.weather.auto.now({
                      season,
                      weather: current,
                      time: timeFormat.format(first.at),
                  })
                : `${season} · ${current}`,
        );
        for (const change of changes) {
            lines.push(
                $LL.mapEditor.settings.weather.auto.then({
                    weather: weatherName(change.weather),
                    time: timeFormat.format(change.at),
                }),
            );
        }
        return lines;
    });

    async function save(): Promise<string> {
        const scene = gameManager.getCurrentGameScene();
        if (
            !get(mapEditorActivated) ||
            !scene.connection ||
            !scene.getMapEditorModeManager() ||
            !scene.getGameMap().getWamFile()
        ) {
            throw new Error($LL.mapEditor.settings.weather.error());
        }
        try {
            // The Auto choices are always sent, so switching back to Auto keeps the last ones.
            await executeUpdateWAMSettings({
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: {
                    weather: Weather.parse(weather),
                    autoFrequency: frequency,
                    autoInclude,
                    // Place removed: back to the default one (Paris), which an absent place alone would not do.
                    ...(location ? { location } : placeRemoved ? { clearLocation: true } : {}),
                },
            });
            saved = { weather, frequency, include: autoInclude.join(), location };
            return $LL.mapEditor.settings.weather.success();
        } catch (error) {
            throw new Error($LL.mapEditor.settings.weather.error(), { cause: error });
        }
    }
</script>

<div class="flex flex-col gap-4">
    <WeatherTiles
        bind:value={weather}
        options={tiles}
        ariaLabel={$LL.mapEditor.settings.weather.title()}
        dataTestId="map-weather-type"
    />

    {#if weather === WeatherType.Automatic}
        <div class="flex flex-col gap-2">
            <span class="text-sm font-bold">{$LL.mapEditor.settings.weather.auto.frequency()}</span>
            <SegmentedControl
                bind:value={frequency}
                options={frequencies}
                ariaLabel={$LL.mapEditor.settings.weather.auto.frequency()}
                dataTestId="map-weather-frequency"
            />
        </div>
        <div class="flex flex-col">
            <span class="text-sm font-bold">{$LL.mapEditor.settings.weather.auto.include()}</span>
            <InputCheckbox
                bind:value={included[WeatherType.Rain]}
                label={$LL.mapEditor.settings.weather.rain()}
                dataTestId="map-weather-include-rain"
            />
            <InputCheckbox
                bind:value={included[WeatherType.Storm]}
                label={`${$LL.mapEditor.settings.weather.storm()} (${$LL.mapEditor.settings.weather.auto.stormHint()})`}
                dataTestId="map-weather-include-storm"
            />
            <InputCheckbox
                bind:value={included[WeatherType.Snow]}
                label={`${$LL.mapEditor.settings.weather.snow()} (${$LL.mapEditor.settings.weather.auto.snowHint()})`}
                dataTestId="map-weather-include-snow"
            />
            <InputCheckbox
                bind:value={included[WeatherType.Fog]}
                label={`${$LL.mapEditor.settings.weather.fog()} (${$LL.mapEditor.settings.weather.auto.fogHint()})`}
                dataTestId="map-weather-include-fog"
            />
        </div>
        <div class="rounded-lg bg-black/30 p-3 text-sm text-white/80" data-testid="map-weather-preview">
            {#each preview as line, index (index)}
                <div>{line}</div>
            {/each}
        </div>
    {:else if weather === WeatherType.Snow}
        <p class="text-sm text-white/60">{$LL.mapEditor.settings.weather.fixed.snowHint()}</p>
    {:else if weather === WeatherType.Fog}
        <p class="text-sm text-white/60">{$LL.mapEditor.settings.weather.fixed.fogHint()}</p>
    {:else if weather === WeatherType.Real}
        <p class="text-sm text-white/60">{$LL.mapEditor.settings.weather.realMode.hint()}</p>
        <div class="rounded-lg bg-black/30 p-3 text-sm text-white/80" data-testid="map-weather-real">
            {#if $realWeatherStore.status === "known"}
                {$LL.mapEditor.settings.weather.realMode.now({ weather: weatherName($realWeatherStore.weather) })}
            {:else if $realWeatherStore.status === "unavailable"}
                {$LL.mapEditor.settings.weather.realMode.unavailable()}
            {:else}
                {$LL.mapEditor.settings.weather.realMode.pending()}
            {/if}
        </div>
        <!-- CC BY 4.0: the data source is credited wherever the real weather is shown. -->
        <a
            class="text-xs text-white/50 underline"
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer">{$LL.mapEditor.settings.weather.realMode.attribution()}</a
        >
    {/if}

    <MapLocationPicker bind:location />

    {#if changed}
        <p class="text-xs text-white/60" data-testid="map-weather-preview-hint">
            {$LL.mapEditor.settings.weather.previewHint()}
        </p>
    {/if}

    <ButtonState
        promise={save}
        initialText={$LL.menu.settings.save()}
        loadingText={$LL.mapEditor.settings.weather.saving()}
        dataTestId="save-map-weather"
    />
</div>
