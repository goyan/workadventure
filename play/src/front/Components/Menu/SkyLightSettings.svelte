<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        moonLightLimits,
        moonLightShownStore,
        moonPhaseCurveStore,
        sunLightLimits,
        sunLightShownStore,
    } from "../../Stores/SkyLightStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import SegmentedControl from "./SegmentedControl.svelte";
    import SkyLightLimits from "./SkyLightLimits.svelte";
</script>

<InputSwitch
    id="sky-sun-light-shown"
    bind:value={$sunLightShownStore}
    label={$LL.menu.settings.skyLight.sun()}
    labelPosition="right"
/>
{#if $sunLightShownStore}
    <SkyLightLimits limits={sunLightLimits} dataTestId="sky-sun-limits" />
{/if}
<InputSwitch
    id="sky-moon-light-shown"
    bind:value={$moonLightShownStore}
    label={$LL.menu.settings.skyLight.moon()}
    labelPosition="right"
/>
{#if $moonLightShownStore}
    <div class="flex flex-col gap-1 ps-4">
        <span class="text-sm text-white">{$LL.menu.settings.skyLight.phaseCurve.label()}</span>
        <SegmentedControl
            ariaLabel={$LL.menu.settings.skyLight.phaseCurve.label()}
            bind:value={$moonPhaseCurveStore}
            dataTestId="sky-moon-phase-curve"
            options={[
                { value: "linear", label: $LL.menu.settings.skyLight.phaseCurve.linear() },
                { value: "realistic", label: $LL.menu.settings.skyLight.phaseCurve.realistic() },
            ]}
        />
    </div>
    <SkyLightLimits limits={moonLightLimits} dataTestId="sky-moon-limits" />
{/if}
