<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { v4 as uuid } from "uuid";
    import {
        RGB_LAMP_DEFAULT_ROTATION_SPEED,
        RGB_LAMP_MAX_ANGLE,
        RGB_LAMP_MAX_RADIUS_TILES,
        RGB_LAMP_MAX_ROTATION_SPEED,
        RGB_LAMP_MIN_ANGLE,
        RGB_LAMP_MIN_RADIUS_TILES,
        RGB_LAMP_MIN_ROTATION_SPEED,
    } from "@workadventure/map-editor";
    import LL from "../../../../i18n/i18n-svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { RgbLampHandles } from "../../../Phaser/Components/MapEditor/RgbLampHandles";
    import {
        parseRgbLampColour,
        RGB_LAMP_PROPERTY,
        rgbLampSettingsOf,
        type RgbLampSettings,
    } from "../../../Phaser/Game/Lamps/RgbLampSettings";
    import { rgbLampPreviewStore } from "../../../Stores/RgbLampStore";
    import Input from "../../Input/Input.svelte";
    import InputRadio from "../../Input/InputRadio.svelte";
    import InputSwitch from "../../Input/InputSwitch.svelte";
    import RangeSlider from "../../Input/RangeSlider.svelte";
    import Button from "../../UI/Button.svelte";

    let { entity }: { entity: Entity } = $props();
    // The lamp this editor was opened for: the handles outlive the selection by an image, when the prop is gone.
    const lamp = (() => entity)();

    /** The settings of the lamp as they are saved (the defaults when nothing was set). */
    const saved = (): RgbLampSettings => rgbLampSettingsOf(lamp.getProperties());

    let color = $state(saved().color);
    let radius = $state(saved().radius);
    let direction = $state(saved().direction);
    let angle = $state(saved().angle);
    let rotation = $state(saved().rotation ?? false);
    let rotationSpeed = $state(saved().rotationSpeed ?? RGB_LAMP_DEFAULT_ROTATION_SPEED);
    let rotationClockwise = $state(saved().rotationClockwise ?? true);
    // The colour as a code, to read it and to copy it to another lamp. It follows the colour (picker, handles) unless
    // it is being typed in: a code being typed is not rewritten under the cursor.
    const colorCodeId = `rgb-lamp-color-code-${lamp.entityId}`;
    let colorCode = $state(saved().color.toLowerCase());
    let colorCodeTyped = $state(false);
    let colorCodeInvalid = $state(false);
    $effect(() => {
        const current = color.toLowerCase();
        if (colorCodeTyped) return;
        colorCode = current;
        colorCodeInvalid = false;
    });

    /** A valid code is shown on the map like a colour being picked; an invalid one leaves the saved colour. */
    function typeColorCode(): void {
        const parsed = parseRgbLampColour(colorCode);
        colorCodeInvalid = parsed === undefined;
        color = parsed ?? saved().color;
    }

    /** A code that is entered is written the way the lamp keeps it; its `change` then saves it like the picker. */
    function enterColorCode(): void {
        const parsed = parseRgbLampColour(colorCode);
        if (parsed !== undefined) colorCode = parsed;
    }

    /** Whether the copy button last worked: it says so for a moment. */
    let copied = $state(false);
    let copiedTimer: ReturnType<typeof setTimeout> | undefined;
    onDestroy(() => clearTimeout(copiedTimer));

    function copyColorCode(): void {
        // `navigator.clipboard` is missing outside a secure context: that is a refusal too.
        Promise.resolve()
            .then(() => navigator.clipboard.writeText(color.toLowerCase()))
            .then(() => {
                copied = true;
                clearTimeout(copiedTimer);
                copiedTimer = setTimeout(() => (copied = false), 2000);
            })
            .catch(() => {
                // Refused: the code is selected, to be copied by hand.
                const field = document.getElementById(colorCodeId);
                if (field instanceof HTMLInputElement) field.select();
            });
    }

    // A lamp that shines all around shows nothing when it turns: its rotation cannot be set.
    const fullCircle = $derived(angle >= RGB_LAMP_MAX_ANGLE);

    /**
     * The settings shown here. The rotation is only written once it was set: a lamp that never turned keeps the
     * property it had (an older map-storage would drop the rotation fields of the map, without refusing it).
     */
    function settingsOf(
        values: RgbLampSettings & { rotation: boolean; rotationSpeed: number; rotationClockwise: boolean },
    ) {
        const { rotation, rotationSpeed, rotationClockwise, ...still } = values;
        const rotationSet = rotation || rotationSpeed !== RGB_LAMP_DEFAULT_ROTATION_SPEED || !rotationClockwise;
        return rotationSet ? { ...still, rotation, rotationSpeed, rotationClockwise } : still;
    }

    const shown = (): RgbLampSettings =>
        settingsOf({ color, radius, direction, angle, rotation, rotationSpeed, rotationClockwise });

    function show(settings: RgbLampSettings): void {
        ({ color, radius, direction, angle } = settings);
        rotation = settings.rotation ?? false;
        rotationSpeed = settings.rotationSpeed ?? RGB_LAMP_DEFAULT_ROTATION_SPEED;
        rotationClockwise = settings.rotationClockwise ?? true;
    }

    // What is being set here is shown on the map before it is saved: the lamp draws it, shadows included.
    $effect(() => {
        const settings = settingsOf({ color, radius, direction, angle, rotation, rotationSpeed, rotationClockwise });
        const kept = saved();
        const same =
            settings.color === kept.color &&
            settings.radius === kept.radius &&
            settings.direction === kept.direction &&
            settings.angle === kept.angle &&
            rotation === (kept.rotation ?? false) &&
            rotationSpeed === (kept.rotationSpeed ?? RGB_LAMP_DEFAULT_ROTATION_SPEED) &&
            rotationClockwise === (kept.rotationClockwise ?? true);
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
<!-- An invalid colour code is not applied: its `change` saves nothing. -->
<fieldset
    class="flex flex-col gap-2 my-3"
    data-testid="rgb-lamp-editor"
    onchange={() => {
        if (!colorCodeInvalid) save();
    }}
>
    <legend class="mb-2">{$LL.mapEditor.properties.rgbLamp.label()}</legend>
    <p class="m-0 text-sm text-white/70">{$LL.mapEditor.properties.rgbLamp.description()}</p>
    <Input
        id="rgb-lamp-color-{lamp.entityId}"
        label={$LL.mapEditor.properties.rgbLamp.color()}
        type="color"
        size="lg"
        bind:value={color}
    />
    <div class="flex items-end gap-1">
        <Input
            id={colorCodeId}
            label={$LL.mapEditor.properties.rgbLamp.colorCode()}
            type="text"
            size="sm"
            maxlength={9}
            spellcheck="false"
            autocomplete="off"
            extraInputClasses="font-mono"
            aria-invalid={colorCodeInvalid}
            aria-describedby={colorCodeInvalid ? `${colorCodeId}-hint` : undefined}
            status={colorCodeInvalid ? "error" : undefined}
            bind:value={colorCode}
            oninput={typeColorCode}
            onchange={enterColorCode}
            onfocusin={() => (colorCodeTyped = true)}
            onfocusout={() => (colorCodeTyped = false)}
        />
        <Button
            variant={copied ? "success" : "light"}
            appearance="border"
            size="xs"
            class="m-0 shrink-0"
            aria-label={$LL.mapEditor.properties.rgbLamp.copyColor()}
            onclick={copyColorCode}
        >
            {copied ? $LL.mapEditor.properties.rgbLamp.copied() : $LL.mapEditor.properties.rgbLamp.copy()}
        </Button>
    </div>
    {#if colorCodeInvalid}
        <p id="{colorCodeId}-hint" class="m-0 text-sm text-red-500">
            {$LL.mapEditor.properties.rgbLamp.colorCodeInvalid()}
        </p>
    {/if}
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
    <!-- A disabled fieldset disables the native inputs inside: a greyed control sends no change, and saves nothing. -->
    <fieldset class="flex flex-col gap-2" class:opacity-50={fullCircle} disabled={fullCircle}>
        <InputSwitch
            id="rgb-lamp-rotation-{lamp.entityId}"
            label={$LL.mapEditor.properties.rgbLamp.rotation()}
            bind:value={rotation}
        />
        <fieldset class="flex flex-col gap-1" class:opacity-50={!rotation} disabled={!rotation}>
            <legend class="sr-only">{$LL.mapEditor.properties.rgbLamp.rotationSense()}</legend>
            <RangeSlider
                label={$LL.mapEditor.properties.rgbLamp.rotationSpeed()}
                unit={$LL.mapEditor.properties.rgbLamp.rotationSpeedUnit()}
                id="rgb-lamp-rotation-speed-{lamp.entityId}"
                min={RGB_LAMP_MIN_ROTATION_SPEED}
                max={RGB_LAMP_MAX_ROTATION_SPEED}
                step={5}
                bind:value={rotationSpeed}
                buttonShape="square"
            />
            <div class="flex flex-wrap">
                <InputRadio
                    id="rgb-lamp-rotation-clockwise-{lamp.entityId}"
                    name="rgb-lamp-rotation-sense-{lamp.entityId}"
                    label={$LL.mapEditor.properties.rgbLamp.rotationClockwise()}
                    value={true}
                    bind:group={rotationClockwise}
                />
                <InputRadio
                    id="rgb-lamp-rotation-counterclockwise-{lamp.entityId}"
                    name="rgb-lamp-rotation-sense-{lamp.entityId}"
                    label={$LL.mapEditor.properties.rgbLamp.rotationCounterclockwise()}
                    value={false}
                    bind:group={rotationClockwise}
                />
            </div>
        </fieldset>
    </fieldset>
    {#if fullCircle}
        <p class="m-0 text-sm text-white/70">{$LL.mapEditor.properties.rgbLamp.rotationFullCircle()}</p>
    {:else if rotation}
        <p class="m-0 text-sm text-white/70">{$LL.mapEditor.properties.rgbLamp.rotationHint()}</p>
    {/if}
</fieldset>
