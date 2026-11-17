<script lang="ts">
    import type { Writable } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import SkyLightSlider from "./SkyLightSlider.svelte";

    interface Props {
        /** The limits of one body (sunLightLimits or moonLightLimits). */
        limits: {
            intensityMin: Writable<number>;
            intensityMax: Writable<number>;
            colorMin: Writable<number>;
            colorMax: Writable<number>;
            shadowMin: Writable<number>;
            shadowMax: Writable<number>;
        };
        dataTestId: string;
    }

    let { limits, dataTestId }: Props = $props();

    const percent = (value: number): string => `${Math.round(value * 100)} %`;
    const tiles = (value: number): string => `${value} ${$LL.menu.settings.skyLight.tiles()}`;
</script>

<details class="rounded-xl border border-white/10 bg-black/10 text-sm">
    <summary
        class="cursor-pointer rounded-xl px-3 py-2 text-white/80 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
        {$LL.menu.settings.skyLight.advanced()}
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3" data-testid={dataTestId}>
        <SkyLightSlider
            id="{dataTestId}-intensity-min"
            label={$LL.menu.settings.skyLight.intensityMin()}
            store={limits.intensityMin}
            min={0}
            max={1}
            step={0.05}
            shown={percent}
        />
        <SkyLightSlider
            id="{dataTestId}-intensity-max"
            label={$LL.menu.settings.skyLight.intensityMax()}
            store={limits.intensityMax}
            min={0}
            max={2}
            step={0.05}
            shown={percent}
        />
        <SkyLightSlider
            id="{dataTestId}-color-min"
            label={$LL.menu.settings.skyLight.colorMin()}
            store={limits.colorMin}
            min={0}
            max={1}
            step={0.05}
            shown={percent}
        />
        <SkyLightSlider
            id="{dataTestId}-color-max"
            label={$LL.menu.settings.skyLight.colorMax()}
            store={limits.colorMax}
            min={0}
            max={2}
            step={0.05}
            shown={percent}
        />
        <SkyLightSlider
            id="{dataTestId}-shadow-min"
            label={$LL.menu.settings.skyLight.shadowMin()}
            store={limits.shadowMin}
            min={0}
            max={2}
            step={0.25}
            shown={tiles}
        />
        <SkyLightSlider
            id="{dataTestId}-shadow-max"
            label={$LL.menu.settings.skyLight.shadowMax()}
            store={limits.shadowMax}
            min={1}
            max={8}
            step={0.5}
            shown={tiles}
        />
    </div>
</details>
