<script lang="ts">
    import { untrack } from "svelte";
    import {
        AIR_LIFE_BOUNDS,
        DEFAULT_AIR_LIFE_SETTINGS,
        DEFAULT_LAND_LIFE_SETTINGS,
        LAND_LIFE_BOUNDS,
        LIFE_BOUNDS,
    } from "@workadventure/map-editor";
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
    let drinkInterval = $state(start.drinkInterval);
    // The life of the land: absent from a map that never had it.
    let landEnabled = $state(start.landEnabled ?? DEFAULT_LAND_LIFE_SETTINGS.landEnabled);
    const LAND_DURATIONS = [
        "antelopeReproductionDelay",
        "antelopeMaxLifespan",
        "landHuntInterval",
        "landPredatorReproductionDelay",
        "landPredatorMaxLifespan",
    ] as const;
    type LandDuration = (typeof LAND_DURATIONS)[number];
    const landStart = (key: LandDuration): number => start[key] ?? DEFAULT_LAND_LIFE_SETTINGS[key];
    let land = $state<Record<LandDuration, number>>({
        antelopeReproductionDelay: landStart("antelopeReproductionDelay"),
        antelopeMaxLifespan: landStart("antelopeMaxLifespan"),
        landHuntInterval: landStart("landHuntInterval"),
        landPredatorReproductionDelay: landStart("landPredatorReproductionDelay"),
        landPredatorMaxLifespan: landStart("landPredatorMaxLifespan"),
    });
    let landPositions = $state<Record<LandDuration, number>>({
        antelopeReproductionDelay: sliderOfDuration(
            landStart("antelopeReproductionDelay"),
            ...LAND_LIFE_BOUNDS.antelopeReproductionDelay,
        ),
        antelopeMaxLifespan: sliderOfDuration(
            landStart("antelopeMaxLifespan"),
            ...LAND_LIFE_BOUNDS.antelopeMaxLifespan,
        ),
        landHuntInterval: sliderOfDuration(landStart("landHuntInterval"), ...LAND_LIFE_BOUNDS.landHuntInterval),
        landPredatorReproductionDelay: sliderOfDuration(
            landStart("landPredatorReproductionDelay"),
            ...LAND_LIFE_BOUNDS.landPredatorReproductionDelay,
        ),
        landPredatorMaxLifespan: sliderOfDuration(
            landStart("landPredatorMaxLifespan"),
            ...LAND_LIFE_BOUNDS.landPredatorMaxLifespan,
        ),
    });

    // The gulls: absent from a map that never had them.
    let gullsEnabled = $state(start.gullsEnabled ?? DEFAULT_AIR_LIFE_SETTINGS.gullsEnabled);
    const AIR_DURATIONS = ["gullHuntInterval", "gullReproductionDelay", "gullMaxLifespan"] as const;
    type AirDuration = (typeof AIR_DURATIONS)[number];
    const airStart = (key: AirDuration): number => start[key] ?? DEFAULT_AIR_LIFE_SETTINGS[key];
    let air = $state<Record<AirDuration, number>>({
        gullHuntInterval: airStart("gullHuntInterval"),
        gullReproductionDelay: airStart("gullReproductionDelay"),
        gullMaxLifespan: airStart("gullMaxLifespan"),
    });
    let airPositions = $state<Record<AirDuration, number>>({
        gullHuntInterval: sliderOfDuration(airStart("gullHuntInterval"), ...AIR_LIFE_BOUNDS.gullHuntInterval),
        gullReproductionDelay: sliderOfDuration(
            airStart("gullReproductionDelay"),
            ...AIR_LIFE_BOUNDS.gullReproductionDelay,
        ),
        gullMaxLifespan: sliderOfDuration(airStart("gullMaxLifespan"), ...AIR_LIFE_BOUNDS.gullMaxLifespan),
    });

    // The durations go from seconds to hours: their sliders move by steps that grow with them.
    let reproductionPosition = $state(sliderOfDuration(start.reproductionDelay, ...LIFE_BOUNDS.reproductionDelay));
    let lifespanPosition = $state(sliderOfDuration(start.maxLifespan, ...LIFE_BOUNDS.maxLifespan));
    let huntPosition = $state(sliderOfDuration(start.huntInterval, ...LIFE_BOUNDS.huntInterval));
    let dolphinReproductionPosition = $state(
        sliderOfDuration(start.dolphinReproductionDelay, ...LIFE_BOUNDS.dolphinReproductionDelay),
    );
    let dolphinLifespanPosition = $state(sliderOfDuration(start.dolphinMaxLifespan, ...LIFE_BOUNDS.dolphinMaxLifespan));
    let drinkPosition = $state(sliderOfDuration(start.drinkInterval, ...LIFE_BOUNDS.drinkInterval));

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
                drinkInterval,
                landEnabled,
                ...land,
                gullsEnabled,
                ...air,
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
<!-- The land animals drink whether the life of the water is on or not. -->
<span class="retro-title mt-2">{$LL.mapEditor.life.landAnimals()}</span>
<div data-testid="life-drink-interval">
    <RangeSlider
        id="terrain-life-drink-interval"
        label={$LL.mapEditor.life.drinkInterval()}
        unit=""
        min={0}
        max={LIFE_SLIDER_STEPS}
        step={1}
        bind:value={drinkPosition}
        valueFormatter={() => formatDuration(drinkInterval)}
        onchange={(position) => {
            drinkInterval = durationAtSlider(position, ...LIFE_BOUNDS.drinkInterval);
            save();
        }}
        buttonShape="square"
    />
</div>
<p class="retro-hint m-0">{$LL.mapEditor.life.landAnimalsHint()}</p>

<!-- The life of the land: antelopes, lions and tigers the server runs, whether the life of the water is on or not. -->
<span class="retro-title mt-2">{$LL.mapEditor.life.land.title()}</span>
<div data-testid="life-land-enabled">
    <InputSwitch
        id="terrain-life-land-enabled"
        bind:value={landEnabled}
        label={$LL.mapEditor.life.land.enabled()}
        labelPosition="right"
        onchange={save}
    />
</div>
<p class="retro-hint m-0">{$LL.mapEditor.life.land.hint()}</p>
{#if landEnabled}
    {#each LAND_DURATIONS as key (key)}
        <div data-testid="life-land-{key}">
            <RangeSlider
                id="terrain-life-land-{key}"
                label={$LL.mapEditor.life.land[key]()}
                unit=""
                min={0}
                max={LIFE_SLIDER_STEPS}
                step={1}
                bind:value={landPositions[key]}
                valueFormatter={() => formatDuration(land[key])}
                onchange={(position) => {
                    const [shortest, longest] = LAND_LIFE_BOUNDS[key];
                    land[key] = durationAtSlider(position, shortest, longest);
                    save();
                }}
                buttonShape="square"
            />
        </div>
    {/each}
{/if}

<!-- The gulls: they fish in the water of the map, so they need its life. -->
<span class="retro-title mt-2">{$LL.mapEditor.life.air.title()}</span>
<div data-testid="life-air-enabled">
    <InputSwitch
        id="terrain-life-air-enabled"
        bind:value={gullsEnabled}
        label={$LL.mapEditor.life.air.enabled()}
        labelPosition="right"
        onchange={save}
    />
</div>
<p class="retro-hint m-0">{$LL.mapEditor.life.air.hint()}</p>
{#if gullsEnabled}
    {#each AIR_DURATIONS as key (key)}
        <div data-testid="life-air-{key}">
            <RangeSlider
                id="terrain-life-air-{key}"
                label={$LL.mapEditor.life.air[key]()}
                unit=""
                min={0}
                max={LIFE_SLIDER_STEPS}
                step={1}
                bind:value={airPositions[key]}
                valueFormatter={() => formatDuration(air[key])}
                onchange={(position) => {
                    const [shortest, longest] = AIR_LIFE_BOUNDS[key];
                    air[key] = durationAtSlider(position, shortest, longest);
                    save();
                }}
                buttonShape="square"
            />
        </div>
    {/each}
{/if}
