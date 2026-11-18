<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        rainAmountStore,
        rainCloudsStore,
        rainLeanStore,
        rainPuddlesStore,
        rainSplashesStore,
    } from "../../Stores/WeatherStore";
    import SkyLightSlider from "./SkyLightSlider.svelte";

    const percent = (value: number): string => `${Math.round(value * 100)} %`;
</script>

<div class="flex flex-col gap-2" data-testid="rain-settings">
    <span class="text-sm text-white">{$LL.menu.settings.rain.title()}</span>
    <SkyLightSlider
        id="rain-amount"
        label={$LL.menu.settings.rain.amount()}
        store={rainAmountStore}
        min={0.25}
        max={2}
        step={0.05}
        shown={percent}
    />
    <SkyLightSlider
        id="rain-lean"
        label={$LL.menu.settings.rain.lean()}
        store={rainLeanStore}
        min={0}
        max={2}
        step={0.05}
        shown={percent}
    />
    <SkyLightSlider
        id="rain-splashes"
        label={$LL.menu.settings.rain.splashes()}
        store={rainSplashesStore}
        min={0}
        max={2}
        step={0.05}
        shown={percent}
    />
    <SkyLightSlider
        id="rain-puddles"
        label={$LL.menu.settings.rain.puddles()}
        store={rainPuddlesStore}
        min={0}
        max={2}
        step={0.05}
        shown={percent}
    />
    <SkyLightSlider
        id="rain-clouds"
        label={$LL.menu.settings.rain.clouds()}
        store={rainCloudsStore}
        min={0}
        max={1}
        step={0.05}
        shown={percent}
    />
</div>
