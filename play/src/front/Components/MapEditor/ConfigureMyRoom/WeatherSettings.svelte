<script lang="ts">
    import { Weather, WeatherType } from "@workadventure/map-editor";
    import { get } from "svelte/store";
    import { mapEditorActivated } from "../../../Stores/MenuStore";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { executeUpdateWAMSettings } from "../../../Phaser/Game/MapEditor/Commands/Facades";
    import Select from "../../Input/Select.svelte";
    import ButtonState from "../../Input/ButtonState.svelte";

    let { showTitle = true }: { showTitle?: boolean } = $props();

    let weather = $state<string>(
        gameManager.getCurrentGameScene().getGameMap().getWamFile()?.getWam().settings?.weather ?? WeatherType.Clear,
    );
    const options = $derived([
        { value: WeatherType.Automatic, label: $LL.mapEditor.settings.weather.automatic() },
        { value: WeatherType.Clear, label: $LL.mapEditor.settings.weather.clear() },
        { value: WeatherType.Rain, label: $LL.mapEditor.settings.weather.rain() },
        { value: WeatherType.Snow, label: $LL.mapEditor.settings.weather.snow() },
        { value: WeatherType.Storm, label: $LL.mapEditor.settings.weather.storm() },
    ]);

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
            await executeUpdateWAMSettings({
                $case: "updateWeatherSettingMessage",
                updateWeatherSettingMessage: { weather: Weather.parse(weather), autoInclude: [] },
            });
            return $LL.mapEditor.settings.weather.success();
        } catch (error) {
            throw new Error($LL.mapEditor.settings.weather.error(), { cause: error });
        }
    }
</script>

{#if showTitle}
    <h3>{$LL.mapEditor.settings.weather.title()}</h3>
{/if}
<p>{$LL.mapEditor.settings.weather.description()}</p>
<div class="flex flex-col gap-4">
    <Select
        label={$LL.mapEditor.settings.weather.title()}
        bind:value={weather}
        {options}
        dataTestId="map-weather-type"
    />
    <ButtonState
        promise={save}
        initialText={$LL.menu.settings.save()}
        loadingText={$LL.mapEditor.settings.weather.saving()}
        dataTestId="save-map-weather"
    />
</div>
