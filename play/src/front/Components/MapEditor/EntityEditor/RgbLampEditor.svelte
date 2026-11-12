<script lang="ts">
    import { onMount } from "svelte";
    import { v4 as uuid } from "uuid";
    import {
        RGB_LAMP_MAX_ANGLE,
        RGB_LAMP_MAX_RADIUS_TILES,
        RGB_LAMP_MIN_ANGLE,
        RGB_LAMP_MIN_RADIUS_TILES,
    } from "@workadventure/map-editor";
    import LL from "../../../../i18n/i18n-svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { RgbLampHandles } from "../../../Phaser/Components/MapEditor/RgbLampHandles";
    import {
        RGB_LAMP_PROPERTY,
        rgbLampSettingsOf,
        type RgbLampSettings,
    } from "../../../Phaser/Game/Lamps/RgbLampSettings";
    import { rgbLampPreviewStore } from "../../../Stores/RgbLampStore";
    import Input from "../../Input/Input.svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";

    let { entity }: { entity: Entity } = $props();
    // The lamp this editor was opened for: the handles outlive the selection by an image, when the prop is gone.
    const lamp = (() => entity)();

    /** The settings of the lamp as they are saved (the defaults when nothing was set). */
    const saved = (): RgbLampSettings => rgbLampSettingsOf(lamp.getProperties());

    let color = $state(saved().color);
    let radius = $state(saved().radius);
    let direction = $state(saved().direction);
    let angle = $state(saved().angle);

    const shown = (): RgbLampSettings => ({ color, radius, direction, angle });

    function show(settings: RgbLampSettings): void {
        ({ color, radius, direction, angle } = settings);
    }

    // What is being set here is shown on the map before it is saved: the lamp draws it, shadows included.
    $effect(() => {
        const settings = { color, radius, direction, angle };
        const kept = saved();
        const same =
            settings.color === kept.color &&
            settings.radius === kept.radius &&
            settings.direction === kept.direction &&
            settings.angle === kept.angle;
        rgbLampPreviewStore.set(same ? undefined : { entityId: lamp.entityId, settings });
    });

    /** Saves the settings as the property of the lamp: everyone sees the same light. */
    function save(): void {
        if (!lamp.canEdit) {
            show(saved());
            return;
        }
        const existing = lamp.getProperties().find((property) => property.type === RGB_LAMP_PROPERTY);
        lamp.setProperty({ id: existing?.id ?? uuid(), type: RGB_LAMP_PROPERTY, ...shown() });
        // The saved lamp shows the same light: the preview has nothing more to say.
        rgbLampPreviewStore.set(undefined);
    }

    onMount(() => {
        const scene = gameManager.getCurrentGameScene();
        const handles = new RgbLampHandles(
            scene,
            lamp,
            scene.getGameMapFrontWrapper().getMap().tilewidth ?? 32,
            shown,
            show,
            (settings) => {
                show(settings);
                save();
            },
        );
        return () => {
            handles.destroy();
            rgbLampPreviewStore.set(undefined);
        };
    });
</script>

<!-- Saved when a control is let go of (its `change` comes up to here), not at every step of a slider or of the colour
     picker: those are only shown on the map (see the preview above), so that a drag is one step to undo. -->
<fieldset class="flex flex-col gap-2 my-3" data-testid="rgb-lamp-editor" onchange={save}>
    <legend class="mb-2">{$LL.mapEditor.properties.rgbLamp.label()}</legend>
    <p class="m-0 text-sm text-white/70">{$LL.mapEditor.properties.rgbLamp.description()}</p>
    <Input
        id="rgb-lamp-color-{lamp.entityId}"
        label={$LL.mapEditor.properties.rgbLamp.color()}
        type="color"
        size="lg"
        bind:value={color}
    />
    <RangeSlider
        label={$LL.mapEditor.properties.rgbLamp.radius()}
        unit=""
        id="rgb-lamp-radius-{lamp.entityId}"
        min={RGB_LAMP_MIN_RADIUS_TILES}
        max={RGB_LAMP_MAX_RADIUS_TILES}
        step={0.5}
        bind:value={radius}
        buttonShape="square"
    />
    <RangeSlider
        label={$LL.mapEditor.properties.rgbLamp.angle()}
        unit="°"
        id="rgb-lamp-angle-{lamp.entityId}"
        min={RGB_LAMP_MIN_ANGLE}
        max={RGB_LAMP_MAX_ANGLE}
        step={1}
        bind:value={angle}
        buttonShape="square"
    />
    <RangeSlider
        label={$LL.mapEditor.properties.rgbLamp.direction()}
        unit="°"
        id="rgb-lamp-direction-{lamp.entityId}"
        min={0}
        max={359}
        step={1}
        bind:value={direction}
        buttonShape="square"
    />
</fieldset>
