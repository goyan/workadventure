<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        RAIN_AMOUNT_LAST_STEP,
        rainAmountOfStep,
        rainAmountStepStore,
        rainCloudsStore,
        rainLeanStore,
        rainPerspectiveStore,
        rainPuddlesStore,
        rainSplashesStore,
    } from "../../Stores/WeatherStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import SkyLightSlider from "./SkyLightSlider.svelte";

    const percent = (value: number): string => `${Math.round(value * 100)} %`;
    // The amount goes by steps: ×1, ×2, ×4... ×32.
    const times = (step: number): string => `×${rainAmountOfStep(step)}`;
</script>

<div class="flex flex-col gap-2" data-testid="rain-settings">
    <span class="text-sm text-white">{$LL.menu.settings.rain.title()}</span>
    <InputSwitch
        id="rain-perspective"
        bind:value={$rainPerspectiveStore}
        label={$LL.menu.settings.rain.perspective()}
        labelPosition="right"
    />
    <SkyLightSlider
        id="rain-amount"
        label={$LL.menu.settings.rain.amount()}
        store={rainAmountStepStore}
        min={0}
        max={RAIN_AMOUNT_LAST_STEP}
        step={1}
        shown={times}
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
