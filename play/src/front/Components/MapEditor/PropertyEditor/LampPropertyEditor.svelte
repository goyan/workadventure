<script lang="ts">
    import { LAMP_LIGHT_MAX_TILES, LAMP_LIGHT_MIN_TILES, type LampPropertyData } from "@workadventure/map-editor";
    import { LL } from "../../../../i18n/i18n-svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconLamp } from "@wa-icons";

    interface Props {
        property: LampPropertyData;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { property = $bindable(), onchange, onclose }: Props = $props();
</script>

<PropertyEditorBase
    onclose={() => {
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconLamp font-size="18" class="mr-2" />
            {$LL.mapEditor.properties.lamp.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <span>
            <p class="m-0 mb-3 text-sm text-white/70">{$LL.mapEditor.properties.lamp.description()}</p>
            <div class="value-input">
                <RangeSlider
                    label={$LL.mapEditor.properties.lamp.width()}
                    unit=""
                    id="lamp-light-width-{property.id}"
                    min={LAMP_LIGHT_MIN_TILES}
                    max={LAMP_LIGHT_MAX_TILES}
                    step={1}
                    bind:value={property.width}
                    onchange={() => onchange?.()}
                    buttonShape="square"
                />
            </div>
            <div class="value-input">
                <RangeSlider
                    label={$LL.mapEditor.properties.lamp.height()}
                    unit=""
                    id="lamp-light-height-{property.id}"
                    min={LAMP_LIGHT_MIN_TILES}
                    max={LAMP_LIGHT_MAX_TILES}
                    step={1}
                    bind:value={property.height}
                    onchange={() => onchange?.()}
                    buttonShape="square"
                />
            </div>
        </span>
    {/snippet}
</PropertyEditorBase>
