<script lang="ts">
    import { onMount } from "svelte";
    import {
        DEFAULT_SINK_RADIUS_TILES,
        heightOfMetres,
        MAX_WATER_LEVEL,
        MAX_WATER_RADIUS_TILES,
        metresOf,
        MIN_WATER_LEVEL,
    } from "@workadventure/map-editor";
    import type { EntityPrefab, WaterSinkPropertyData, WaterSourcePropertyData } from "@workadventure/map-editor";
    import { waterAnchorOf } from "../../../Phaser/Game/Terrain/WaterAnchor";
    import {
        flowAtSlider,
        flowFromUnit,
        flowInUnit,
        sliderOfFlow,
        steppedFlow,
        WATER_FLOW_SLIDER_STEPS,
        WATER_FLOW_UNITS,
        waterFlowUnit,
    } from "../../../Phaser/Game/Terrain/WaterFlowUnits";
    import type { WaterFlowUnitId } from "../../../Phaser/Game/Terrain/WaterFlowUnits";
    import { LL, locale } from "../../../../i18n/i18n-svelte";
    import { readWaterLevelAt } from "../../../Phaser/Game/Terrain/WaterLevelPipette";
    import { metresLabel } from "../../../Phaser/Game/Floors/AvatarAltitude";
    import { pointerGroundStore } from "../../../Stores/FloorLevelsStore";
    import {
        armWaterLevelPipette,
        disarmWaterLevelPipette,
        waterLevelPipetteStore,
    } from "../../../Stores/WaterLevelPipetteStore";
    import InputSwitch from "../../Input/InputSwitch.svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconColorPicker, IconDroplet } from "@wa-icons";

    interface Props {
        /** The object carrying the property: its foot is where the water comes out. */
        entity: {
            x: number;
            y: number;
            displayWidth: number;
            displayHeight: number;
            getPrefab?: () => Pick<EntityPrefab, "waterFlow">;
        };
        property: WaterSourcePropertyData | WaterSinkPropertyData;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { entity, property = $bindable(), onchange, onclose }: Props = $props();

    let anchor = $derived(waterAnchorOf(entity));
    // The server does not know the size of the objects: the editor writes where the foot is, from the corner of the
    // image. A property made before that, or an object whose size changed, is put right when its panel opens.
    onMount(() => {
        if (property.anchorX !== anchor.anchorX || property.anchorY !== anchor.anchorY) {
            property.anchorX = anchor.anchorX;
            property.anchorY = anchor.anchorY;
            onchange?.();
        }
    });
    /** The unit one last chose, kept in this browser: a convenience, the flow itself is stored in litres a minute. */
    const UNIT_KEY = "waterFlowUnit";
    function rememberedUnit(): WaterFlowUnitId {
        try {
            return waterFlowUnit(localStorage.getItem(UNIT_KEY)).id;
        } catch {
            return waterFlowUnit(undefined).id;
        }
    }
    let unit = $state(rememberedUnit());
    // The flow of the property, in litres a minute, as this panel last set it.
    let litres = $state(property.flow);
    let shown = $derived(flowInUnit(litres, unit));
    // The slider goes from nothing to the largest flow, by steps that grow with the flow.
    let position = $state(sliderOfFlow(property.flow));

    function setUnit(id: string): void {
        unit = waterFlowUnit(id).id;
        try {
            localStorage.setItem(UNIT_KEY, unit);
        } catch {
            // A browser that keeps nothing: the unit holds for this panel only.
        }
    }

    function setFlow(value: number): void {
        setLitres(flowFromUnit(value, unit));
        position = sliderOfFlow(litres);
    }

    function setLitres(value: number): void {
        litres = value;
        property.flow = litres;
        onchange?.();
    }

    // The disc a source pours over or a sink takes from, in tiles: a source pours at its foot until one is set.
    let radius = $state(property.radius ?? (property.type === "waterSinkPropertyData" ? DEFAULT_SINK_RADIUS_TILES : 0));

    function setRadius(value: number): void {
        property.radius = value;
        onchange?.();
    }

    // The level the source or the sink holds: stored in pixels of altitude, set in metres like the altitude shown
    // under the clock. Unset, the object always runs.
    let holdsLevel = $state(property.level !== undefined);
    let levelMetres = $state(Math.round(metresOf(property.level ?? 0) * 10) / 10);

    function setLevel(): void {
        if (holdsLevel) {
            const px = Math.round(heightOfMetres(Number.isFinite(levelMetres) ? levelMetres : 0));
            property.level = Math.min(MAX_WATER_LEVEL, Math.max(MIN_WATER_LEVEL, px));
        } else {
            property.level = undefined;
        }
        onchange?.();
    }

    // A sink standing on a floor of the Map tool dries that floor, whatever its flow, unless turned off (adaptive).
    let adaptive = $state(property.type === "waterSinkPropertyData" && property.adaptive !== false);

    function setAdaptive(): void {
        if (property.type !== "waterSinkPropertyData") return;
        property.adaptive = adaptive ? undefined : false;
        onchange?.();
    }

    // The pipette: a click on the map writes the level read there (the surface of the water, or the ground), and holds
    // it, as if typed. The panel and its object stay as they are while it aims.
    function takeLevel(point: { x: number; y: number }, ground: boolean): void {
        levelMetres = readWaterLevelAt(point, ground);
        holdsLevel = true;
        setLevel();
    }
    let aiming = $derived($waterLevelPipetteStore === takeLevel);

    function togglePipette(): void {
        if (aiming) disarmWaterLevelPipette();
        else armWaterLevelPipette(takeLevel);
    }

    // What a click would take now, as the floors badge reads it under the pointer (maps with a relief).
    let preview = $derived.by(() => {
        const under = $pointerGroundStore;
        if (!aiming || !under) return undefined;
        return under.surface === undefined
            ? $LL.mapEditor.properties.waterLevelPipette.previewGround({ level: metresLabel(under.ground, $locale) })
            : $LL.mapEditor.properties.waterLevelPipette.previewWater({
                  level: metresLabel(under.surface, $locale),
                  ground: metresLabel(under.ground, $locale),
              });
    });

    // The panel closes (another object, another tool, the editor closed): the pipette aims for nothing any more.
    $effect(() => () => {
        if ($waterLevelPipetteStore === takeLevel) disarmWaterLevelPipette();
    });

    // Escape cancels the aim, and only that: captured and stopped, it does not also drop the selected object.
    function cancelOnEscape(event: KeyboardEvent): void {
        if (!aiming || event.key !== "Escape") return;
        event.stopPropagation();
        disarmWaterLevelPipette();
    }

    function step(direction: 1 | -1): void {
        setFlow(steppedFlow(shown, direction, waterFlowUnit(unit).first));
    }

    let texts = $derived(
        property.type === "waterSourcePropertyData"
            ? $LL.mapEditor.properties.waterSource
            : $LL.mapEditor.properties.waterSink,
    );
</script>

<svelte:window onkeydowncapture={cancelOnEscape} />

<PropertyEditorBase
    onclose={() => {
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconDroplet font-size="18" class="mr-2" />
            {texts.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <span>
            <p class="m-0 mb-3 text-sm text-white/70">{texts.description()}</p>
            <label class="block text-sm mb-1" for="water-flow-{property.id}">{texts.flow()}</label>
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="btn btn-sm btn-light px-3"
                    data-testid="water-flow-less"
                    aria-label={texts.less()}
                    onclick={() => step(-1)}>−</button
                >
                <input
                    type="number"
                    class="input-text w-28 min-w-0"
                    id="water-flow-{property.id}"
                    data-testid="water-flow-value"
                    min="0"
                    step="any"
                    value={shown}
                    onchange={(event) => setFlow(Number(event.currentTarget.value))}
                />
                <button
                    type="button"
                    class="btn btn-sm btn-light px-3"
                    data-testid="water-flow-more"
                    aria-label={texts.more()}
                    onclick={() => step(1)}>+</button
                >
                <select
                    class="input-text w-24"
                    data-testid="water-flow-unit"
                    aria-label={texts.unit()}
                    value={unit}
                    onchange={(event) => setUnit(event.currentTarget.value)}
                >
                    {#each WATER_FLOW_UNITS as choice (choice.id)}
                        <option value={choice.id}>{choice.label}</option>
                    {/each}
                </select>
            </div>
            <div class="mt-3" data-testid="water-flow-slider">
                <RangeSlider
                    id="water-flow-slider-{property.id}"
                    min={0}
                    max={WATER_FLOW_SLIDER_STEPS}
                    step={1}
                    bind:value={position}
                    onchange={(value) => setLitres(flowAtSlider(value))}
                    buttonShape="square"
                    wrapperMargins={false}
                />
            </div>
            <div class="mt-3" data-testid="water-flow-radius">
                <RangeSlider
                    id="water-flow-radius-{property.id}"
                    label={texts.radius()}
                    unit=""
                    min={0}
                    max={MAX_WATER_RADIUS_TILES}
                    step={0.5}
                    bind:value={radius}
                    onchange={setRadius}
                    buttonShape="square"
                    wrapperMargins={false}
                />
                <p class="m-0 mt-1 text-xs text-white/60">{texts.radiusHint()}</p>
            </div>
            <div class="mt-3" data-testid="water-flow-level">
                <div class="flex items-center justify-between gap-2">
                    <InputSwitch
                        id="water-flow-level-{property.id}"
                        label={texts.level()}
                        bind:value={holdsLevel}
                        onchange={setLevel}
                    />
                    <button
                        type="button"
                        class="btn btn-sm shrink-0 {aiming ? 'btn-secondary' : 'btn-light btn-ghost'}"
                        title={$LL.mapEditor.properties.waterLevelPipette.title()}
                        aria-label={$LL.mapEditor.properties.waterLevelPipette.title()}
                        aria-pressed={aiming}
                        data-testid="water-flow-level-pipette"
                        onclick={togglePipette}
                    >
                        <IconColorPicker font-size="16" />
                    </button>
                </div>
                {#if aiming}
                    <p class="m-0 mt-1 text-xs text-white" role="status" data-testid="water-flow-level-aiming">
                        {$LL.mapEditor.properties.waterLevelPipette.aiming()}
                        {#if preview}<span class="block tabular-nums text-white/80">{preview}</span>{/if}
                    </p>
                {/if}
                {#if holdsLevel}
                    <div class="flex items-center gap-2 mt-1">
                        <input
                            type="number"
                            class="input-text w-28 min-w-0"
                            data-testid="water-flow-level-value"
                            aria-label={texts.levelValue()}
                            step="0.1"
                            bind:value={levelMetres}
                            onchange={setLevel}
                        />
                        <span class="text-sm">m</span>
                    </div>
                {/if}
                <p class="m-0 mt-1 text-xs text-white/60">{texts.levelHint()}</p>
            </div>
            {#if property.type === "waterSinkPropertyData"}
                <div class="mt-3" data-testid="water-sink-adaptive">
                    <InputSwitch
                        id="water-sink-adaptive-{property.id}"
                        label={$LL.mapEditor.properties.waterSink.adaptive()}
                        bind:value={adaptive}
                        onchange={setAdaptive}
                    />
                    <p class="m-0 mt-1 text-xs text-white/60">{$LL.mapEditor.properties.waterSink.adaptiveHint()}</p>
                </div>
            {/if}
            <p class="m-0 mt-2 text-xs text-white/60">{texts.real()}</p>
        </span>
    {/snippet}
</PropertyEditorBase>
