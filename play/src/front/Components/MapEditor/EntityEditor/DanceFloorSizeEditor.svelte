<script lang="ts">
    import { onMount } from "svelte";
    import { v4 as uuid } from "uuid";
    import { LAMP_LIGHT_MAX_TILES, LAMP_LIGHT_MIN_TILES } from "@workadventure/map-editor";
    import LL from "../../../../i18n/i18n-svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { PlacedImageResizeHandles } from "../../../Phaser/Components/MapEditor/PlacedImageResizeHandles";
    import { DANCE_FLOOR_TILE_PX } from "../../../Phaser/Game/Lamps/DanceFloorPatterns";
    import { danceFloorBounds, danceFloorTiles, lampSizeOf } from "../../../Phaser/Game/Lamps/LampReconcile";
    import RangeSlider from "../../Input/RangeSlider.svelte";

    let { entity }: { entity: Entity } = $props();

    /** The size of the floor as it is saved, in tiles. */
    function savedTiles(): { width: number; height: number } {
        return danceFloorTiles(danceFloorBounds(entity, lampSizeOf(entity.getProperties())));
    }

    let width = $state(savedTiles().width);
    let height = $state(savedTiles().height);

    /** Saves the size, and the place of the floor when a corner was dragged; refused outside the map. */
    function applySize(position?: { x: number; y: number }): void {
        const scene = gameManager.getCurrentGameScene();
        const fits = scene
            .getGameMapFrontWrapper()
            .canEntityBePlacedOnMap(
                position ?? { x: entity.x, y: entity.y },
                width * DANCE_FLOOR_TILE_PX,
                height * DANCE_FLOOR_TILE_PX,
                undefined,
                entity.getOldPosition(),
            );
        if (!entity.canEdit || !fits) {
            ({ width, height } = savedTiles());
            return;
        }
        const existing = entity.getProperties().find((property) => property.type === "lampPropertyData");
        entity.setProperty({ id: existing?.id ?? uuid(), type: "lampPropertyData", width, height }, position);
    }

    onMount(() => {
        const handles = new PlacedImageResizeHandles(
            gameManager.getCurrentGameScene(),
            entity,
            () => false,
            () => false,
            (size) => {
                ({ width, height } = danceFloorTiles(size));
            },
            (bounds) => {
                ({ width, height } = danceFloorTiles(bounds));
                applySize({ x: bounds.x, y: bounds.y });
            },
            {
                // The floor goes on moving under the outline of its new size: a stretched image would hide it.
                outlineOnly: true,
                size: () => danceFloorBounds(entity, lampSizeOf(entity.getProperties())),
                // A corner is dragged from tile to tile.
                constrain: (size) => {
                    const tiles = danceFloorTiles(size);
                    return { width: tiles.width * DANCE_FLOOR_TILE_PX, height: tiles.height * DANCE_FLOOR_TILE_PX };
                },
            },
        );
        return () => handles.destroy();
    });
</script>

<fieldset class="flex flex-col gap-2 my-3" data-testid="dance-floor-size">
    <legend class="mb-2">{$LL.mapEditor.properties.danceFloor.label()}</legend>
    <p class="m-0 text-sm text-white/70">{$LL.mapEditor.properties.danceFloor.description()}</p>
    <RangeSlider
        label={$LL.mapEditor.properties.lamp.width()}
        unit=""
        id="dance-floor-width-{entity.entityId}"
        min={LAMP_LIGHT_MIN_TILES}
        max={LAMP_LIGHT_MAX_TILES}
        step={1}
        bind:value={width}
        onchange={() => applySize()}
        buttonShape="square"
    />
    <RangeSlider
        label={$LL.mapEditor.properties.lamp.height()}
        unit=""
        id="dance-floor-height-{entity.entityId}"
        min={LAMP_LIGHT_MIN_TILES}
        max={LAMP_LIGHT_MAX_TILES}
        step={1}
        bind:value={height}
        onchange={() => applySize()}
        buttonShape="square"
    />
</fieldset>
