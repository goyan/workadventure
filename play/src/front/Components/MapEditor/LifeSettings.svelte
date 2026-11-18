<script lang="ts">
    import { untrack } from "svelte";
    import { LIFE_BOUNDS } from "@workadventure/map-editor";
    import type { LifeSettings } from "@workadventure/map-editor";
    import { LL } from "../../../i18n/i18n-svelte";
    import { executeUpdateWAMSettings } from "../../Phaser/Game/MapEditor/Commands/Facades";
    import {
        durationAtSlider,
        formatDuration,
        LIFE_SLIDER_STEPS,
        sliderOfDuration,
    } from "../../Phaser/Game/Life/LifeDurations";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";

    interface Props {
        /** What the map says now of the life of its water. */
        initial: LifeSettings;
    }

    let { initial }: Props = $props();
    // Read once, when the panel opens: each change below is then written back to the map, for every editor.
    const start = untrack(() => initial);

    let enabled = $state(start.enabled);
    let reproductionDelay = $state(start.reproductionDelay);
    let maxLifespan = $state(start.maxLifespan);
    let maxSpeed = $state(start.maxSpeed);
    let huntInterval = $state(start.huntInterval);
    let dolphinReproductionDelay = $state(start.dolphinReproductionDelay);
    let dolphinMaxLifespan = $state(start.dolphinMaxLifespan);

    // The durations go from seconds to hours: their sliders move by steps that grow with them.
    let reproductionPosition = $state(sliderOfDuration(start.reproductionDelay, ...LIFE_BOUNDS.reproductionDelay));
    let lifespanPosition = $state(sliderOfDuration(start.maxLifespan, ...LIFE_BOUNDS.maxLifespan));
    let huntPosition = $state(sliderOfDuration(start.huntInterval, ...LIFE_BOUNDS.huntInterval));
    let dolphinReproductionPosition = $state(
        sliderOfDuration(start.dolphinReproductionDelay, ...LIFE_BOUNDS.dolphinReproductionDelay),
    );
    let dolphinLifespanPosition = $state(sliderOfDuration(start.dolphinMaxLifespan, ...LIFE_BOUNDS.dolphinMaxLifespan));

    function save(): void {
        executeUpdateWAMSettings({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: {
                enabled,
                reproductionDelay,
                maxLifespan,
                maxSpeed,
                huntInterval,
                dolphinReproductionDelay,
                dolphinMaxLifespan,
            },
        }).catch((error: unknown) => console.error("The life of the water could not be saved", error));
    }
</script>

<span class="retro-title mt-2">{$LL.mapEditor.life.settings()}</span>
<div data-testid="life-enabled">
    <InputSwitch
        id="terrain-life-enabled"
        bind:value={enabled}
        label={$LL.mapEditor.life.enabled()}
        labelPosition="right"
        onchange={save}
    />
</div>
<p class="retro-hint m-0">{$LL.mapEditor.life.hint()}</p>
{#if enabled}
    <div data-testid="life-reproduction-delay">
        <RangeSlider
            id="terrain-life-reproduction-delay"
            label={$LL.mapEditor.life.reproductionDelay()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={reproductionPosition}
            valueFormatter={() => formatDuration(reproductionDelay)}
            onchange={(position) => {
                reproductionDelay = durationAtSlider(position, ...LIFE_BOUNDS.reproductionDelay);
                save();
            }}
            buttonShape="square"
        />
    </div>
    <div data-testid="life-max-lifespan">
        <RangeSlider
            id="terrain-life-max-lifespan"
            label={$LL.mapEditor.life.maxLifespan()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={lifespanPosition}
            valueFormatter={() => formatDuration(maxLifespan)}
            onchange={(position) => {
                maxLifespan = durationAtSlider(position, ...LIFE_BOUNDS.maxLifespan);
                save();
            }}
            buttonShape="square"
        />
    </div>
    <div data-testid="life-max-speed">
        <RangeSlider
            id="terrain-life-max-speed"
            label={$LL.mapEditor.life.maxSpeed()}
            unit={$LL.mapEditor.life.tilesPerSecond()}
            min={LIFE_BOUNDS.maxSpeed[0]}
            max={LIFE_BOUNDS.maxSpeed[1]}
            step={0.1}
            bind:value={maxSpeed}
            onchange={save}
            buttonShape="square"
        />
    </div>
    <div data-testid="life-hunt-interval">
        <RangeSlider
            id="terrain-life-hunt-interval"
            label={$LL.mapEditor.life.huntInterval()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={huntPosition}
            valueFormatter={() => formatDuration(huntInterval)}
            onchange={(position) => {
                huntInterval = durationAtSlider(position, ...LIFE_BOUNDS.huntInterval);
                save();
            }}
            buttonShape="square"
        />
    </div>
    <div data-testid="life-dolphin-reproduction-delay">
        <RangeSlider
            id="terrain-life-dolphin-reproduction-delay"
            label={$LL.mapEditor.life.dolphinReproductionDelay()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={dolphinReproductionPosition}
            valueFormatter={() => formatDuration(dolphinReproductionDelay)}
            onchange={(position) => {
                dolphinReproductionDelay = durationAtSlider(position, ...LIFE_BOUNDS.dolphinReproductionDelay);
                save();
            }}
            buttonShape="square"
        />
    </div>
    <div data-testid="life-dolphin-max-lifespan">
        <RangeSlider
            id="terrain-life-dolphin-max-lifespan"
            label={$LL.mapEditor.life.dolphinMaxLifespan()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={dolphinLifespanPosition}
            valueFormatter={() => formatDuration(dolphinMaxLifespan)}
            onchange={(position) => {
                dolphinMaxLifespan = durationAtSlider(position, ...LIFE_BOUNDS.dolphinMaxLifespan);
                save();
            }}
            buttonShape="square"
        />
    </div>
    <p class="retro-hint m-0">{$LL.mapEditor.life.dolphinHint()}</p>
{/if}
