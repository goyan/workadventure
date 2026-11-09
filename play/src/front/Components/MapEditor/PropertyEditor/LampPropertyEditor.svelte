<script lang="ts">
    import {
        LAMP_LIGHT_MAX_TILES,
        LAMP_LIGHT_MIN_TILES,
        STROBE_DEFAULT_HZ,
        STROBE_MAX_HZ,
        STROBE_MIN_HZ,
        type LampPropertyData,
    } from "@workadventure/map-editor";
    import { LL } from "../../../../i18n/i18n-svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconLamp } from "@wa-icons";

    /** The usual rates of the strobes of a club, as shortcuts. */
    const STROBE_PRESETS_HZ = [1, 2, 3, 5, 8, 10, 12];

    interface Props {
        property: LampPropertyData;
        /** The kind of lamp: only a strobe has a rate. */
        kind?: string;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { property = $bindable(), kind, onchange, onclose }: Props = $props();

    function setStrobeHz(hz: number) {
        property.strobeHz = hz;
        onchange?.();
    }
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
            {#if kind === "strobe"}
                <div class="value-input">
                    <RangeSlider
                        label={$LL.mapEditor.properties.lamp.strobeHz()}
                        unit=" Hz"
                        id="lamp-strobe-hz-{property.id}"
                        min={STROBE_MIN_HZ}
                        max={STROBE_MAX_HZ}
                        step={0.5}
                        bind:value={property.strobeHz}
                        onchange={() => onchange?.()}
                        buttonShape="square"
                    />
                    <div class="flex flex-wrap gap-1 mt-1" data-testid="strobe-presets">
                        {#each STROBE_PRESETS_HZ as hz (hz)}
                            <button
                                type="button"
                                class="rounded border border-white/20 px-2 py-0.5 text-xs text-white/80 hover:bg-white/10 {(property.strobeHz ??
                                    STROBE_DEFAULT_HZ) === hz
                                    ? 'bg-white/20'
                                    : ''}"
                                data-testid="strobe-preset-{hz}"
                                onclick={() => setStrobeHz(hz)}
                            >
                                {hz} Hz
                            </button>
                        {/each}
                    </div>
                    <p class="m-0 mt-2 text-xs text-white/60">{$LL.mapEditor.properties.lamp.strobeHzHint()}</p>
                </div>
            {/if}
        </span>
    {/snippet}
</PropertyEditorBase>
