<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import * as Sentry from "@sentry/svelte";
    import LL from "../../../../i18n/i18n-svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { PlacedImageResizeHandles } from "../../../Phaser/Components/MapEditor/PlacedImageResizeHandles";
    import {
        isPlacedImageSizeValid,
        MAX_PLACED_IMAGE_DIMENSION,
        PlacedImageResizeError,
        resizePlacedImage,
    } from "../../../Phaser/Game/MapEditor/PlacedImageResize";
    import { mapEditorSelectedEntityStore } from "../../../Stores/MapEditorStore";
    import Input from "../../Input/Input.svelte";
    import InputSwitch from "../../Input/InputSwitch.svelte";

    let { entity }: { entity: Entity } = $props();
    let width = $state((() => entity.width)());
    let height = $state((() => entity.height)());
    let keepProportions = $state(true);
    let busy = $state(false);
    let error = $state(false);
    const controller = new AbortController();
    const ratio = (() => entity.width / entity.height)();
    const valid = $derived(isPlacedImageSizeValid({ width, height }));

    function changeWidth(): void {
        if (keepProportions && Number.isFinite(width)) height = Math.max(1, Math.round(width / ratio));
    }

    function changeHeight(): void {
        if (keepProportions && Number.isFinite(height)) width = Math.max(1, Math.round(height * ratio));
    }

    function applySize(position?: { x: number; y: number }): void {
        if (!valid || busy) return;
        busy = true;
        error = false;
        const scene = gameManager.getCurrentGameScene();
        resizePlacedImage(scene, entity, { width, height }, controller.signal, position)
            .then(() => {
                if (controller.signal.aborted) return;
                const current = scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().get(entity.entityId);
                if ($mapEditorSelectedEntityStore === entity) mapEditorSelectedEntityStore.set(current);
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) {
                    error = true;
                    if (!(cause instanceof PlacedImageResizeError)) {
                        console.error("Failed to resize placed image", { entityId: entity.entityId, error: cause });
                        Sentry.captureException(cause);
                    }
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) busy = false;
            });
    }

    onMount(() => {
        const handles = new PlacedImageResizeHandles(
            gameManager.getCurrentGameScene(),
            entity,
            () => keepProportions,
            () => busy,
            (size) => {
                width = size.width;
                height = size.height;
            },
            (bounds) => {
                width = bounds.width;
                height = bounds.height;
                applySize({ x: bounds.x, y: bounds.y });
            },
        );
        return () => handles.destroy();
    });

    onDestroy(() => controller.abort());
</script>

<fieldset disabled={busy} class="flex flex-col gap-2 my-3">
    <legend class="mb-2">{$LL.mapEditor.entityEditor.resize.title()}</legend>
    <div class="flex gap-2">
        <Input
            id="placed-image-width"
            dataTestId="placed-image-width"
            label={$LL.mapEditor.entityEditor.resize.width()}
            type="number"
            min={1}
            max={MAX_PLACED_IMAGE_DIMENSION}
            step={1}
            bind:value={width}
            onchange={changeWidth}
        />
        <Input
            id="placed-image-height"
            dataTestId="placed-image-height"
            label={$LL.mapEditor.entityEditor.resize.height()}
            type="number"
            min={1}
            max={MAX_PLACED_IMAGE_DIMENSION}
            step={1}
            bind:value={height}
            onchange={changeHeight}
        />
    </div>
    <InputSwitch
        id="placed-image-proportions"
        label={$LL.mapEditor.entityEditor.resize.keepProportions()}
        bind:value={keepProportions}
    />
    <button
        class="btn btn-secondary w-full"
        data-testid="resize-placed-image"
        disabled={!valid || busy || (width === entity.width && height === entity.height)}
        onclick={() => applySize()}
    >
        {busy ? $LL.mapEditor.entityEditor.resize.saving() : $LL.mapEditor.entityEditor.resize.apply()}
    </button>
    {#if !valid}
        <p class="text-sm text-red-400">{$LL.mapEditor.entityEditor.resize.invalidSize()}</p>
    {/if}
    {#if error}
        <p class="text-sm text-red-400" role="alert">{$LL.mapEditor.entityEditor.resize.error()}</p>
    {/if}
</fieldset>
