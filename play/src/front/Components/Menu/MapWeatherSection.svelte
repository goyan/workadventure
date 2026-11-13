<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { mapEditorActivated } from "../../Stores/MenuStore";
    import SettingsSection from "./SettingsSection.svelte";
    import WeatherSettings from "./WeatherSettings.svelte";
</script>

<!-- The weather everyone sees on this map, for people who may edit the map. -->
{#if $mapEditorActivated}
    <SettingsSection
        title={$LL.menu.settings.mapWeather.title()}
        description={$LL.menu.settings.mapWeather.description()}
        dataTestId="map-weather-settings"
    >
        <WeatherSettings />
    </SettingsSection>
{/if}
