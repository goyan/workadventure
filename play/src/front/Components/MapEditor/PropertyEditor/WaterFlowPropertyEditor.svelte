<script lang="ts">
    import { onMount } from "svelte";
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
    import { LL } from "../../../../i18n/i18n-svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconDroplet } from "@wa-icons";

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

    function step(direction: 1 | -1): void {
        setFlow(steppedFlow(shown, direction, waterFlowUnit(unit).first));
    }

    let texts = $derived(
        property.type === "waterSourcePropertyData"
            ? $LL.mapEditor.properties.waterSource
            : $LL.mapEditor.properties.waterSink,
    );
</script>

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
            <p class="m-0 mt-2 text-xs text-white/60">{texts.real()}</p>
        </span>
    {/snippet}
</PropertyEditorBase>
