<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import WeatherSettings from "../MapEditor/ConfigureMyRoom/WeatherSettings.svelte";
    import Popup from "./Popup.svelte";

    let { isOpen }: { isOpen: boolean } = $props();
</script>

<Popup {isOpen} withAction={false}>
    {#snippet title()}
        <h1>{$LL.mapEditor.settings.weather.title()}</h1>
    {/snippet}
    {#snippet content()}
        <div class="w-full text-start" data-testid="weather-settings-modal">
            <WeatherSettings showTitle={false} />
        </div>
    {/snippet}
</Popup>
