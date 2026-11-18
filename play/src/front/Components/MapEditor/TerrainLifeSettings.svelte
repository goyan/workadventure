<script lang="ts">
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
    import { aquaticLifeCountsStore } from "../../Stores/TerrainEditorStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import RangeSlider from "../Input/RangeSlider.svelte";

    interface Props {
        /** What the map says now of the life of its water. */
        initial: LifeSettings;
    }

    let { initial }: Props = $props();

    // Each change is written back to the map, for every editor; the server then runs the life with it.
    let enabled = $state(initial.enabled);
    let reproductionDelay = $state(initial.reproductionDelay);
    let maxLifespan = $state(initial.maxLifespan);
    let maxSpeed = $state(initial.maxSpeed);
    let huntInterval = $state(initial.huntInterval);

    // The durations go from seconds to hours: their sliders move by steps that grow with them.
    let reproductionPosition = $state(sliderOfDuration(initial.reproductionDelay, ...LIFE_BOUNDS.reproductionDelay));
    let lifespanPosition = $state(sliderOfDuration(initial.maxLifespan, ...LIFE_BOUNDS.maxLifespan));
    let huntPosition = $state(sliderOfDuration(initial.huntInterval, ...LIFE_BOUNDS.huntInterval));

    function save(): void {
        executeUpdateWAMSettings({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: { enabled, reproductionDelay, maxLifespan, maxSpeed, huntInterval },
        }).catch((error: unknown) => console.error("The life of the water could not be saved", error));
    }
</script>

<span class="retro-title mt-2">{$LL.mapEditor.terrain.life.title()}</span>
<div data-testid="life-enabled">
    <InputSwitch
        id="terrain-life-enabled"
        bind:value={enabled}
        label={$LL.mapEditor.terrain.life.enabled()}
        labelPosition="right"
        onchange={save}
    />
</div>
<p class="retro-hint m-0">{$LL.mapEditor.terrain.life.hint()}</p>
{#if enabled}
    <p class="m-0 text-sm text-white" role="status" data-testid="life-counts">
        {$LL.mapEditor.terrain.life.counts($aquaticLifeCountsStore)}
    </p>
    <div data-testid="life-reproduction-delay">
        <RangeSlider
            id="terrain-life-reproduction-delay"
            label={$LL.mapEditor.terrain.life.reproductionDelay()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={reproductionPosition}
            valueFormatter={(position) => formatDuration(durationAtSlider(position, ...LIFE_BOUNDS.reproductionDelay))}
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
            label={$LL.mapEditor.terrain.life.maxLifespan()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={lifespanPosition}
            valueFormatter={(position) => formatDuration(durationAtSlider(position, ...LIFE_BOUNDS.maxLifespan))}
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
            label={$LL.mapEditor.terrain.life.maxSpeed()}
            unit={$LL.mapEditor.terrain.life.tilesPerSecond()}
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
            label={$LL.mapEditor.terrain.life.huntInterval()}
            unit=""
            min={0}
            max={LIFE_SLIDER_STEPS}
            step={1}
            bind:value={huntPosition}
            valueFormatter={(position) => formatDuration(durationAtSlider(position, ...LIFE_BOUNDS.huntInterval))}
            onchange={(position) => {
                huntInterval = durationAtSlider(position, ...LIFE_BOUNDS.huntInterval);
                save();
            }}
            buttonShape="square"
        />
    </div>
{/if}
