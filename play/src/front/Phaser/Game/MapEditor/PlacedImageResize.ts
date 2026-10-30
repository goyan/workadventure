import type { EntityDimensions } from "@workadventure/map-editor";
import { CustomEntityDirection } from "@workadventure/messages";
import { filter, firstValueFrom, fromEvent, takeUntil, timeout } from "rxjs";
import { v4 as uuid } from "uuid";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { CreateEntityFrontCommand } from "./Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "./Commands/Entity/DeleteEntityFrontCommand";
import { UploadEntityFrontCommand } from "./Commands/Entity/UploadEntityFrontCommand";

// Custom image collision cells are 32px, as in CustomEntityEditionForm.
const COLLISION_CELL_SIZE = 32;
export const MAX_PLACED_IMAGE_DIMENSION = 4096;

export class PlacedImageResizeError extends Error {}

export function isPlacedImageSizeValid(size: EntityDimensions): boolean {
    return [size.width, size.height].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= MAX_PLACED_IMAGE_DIMENSION,
    );
}

/** Cover every destination cell touched by a scaled solid source cell. */
export function resizeImageCollisionGrid(
    grid: number[][] | undefined,
    source: EntityDimensions,
    target: EntityDimensions,
): number[][] | undefined {
    if (!grid) return undefined;
    const result = Array.from({ length: Math.ceil(target.height / COLLISION_CELL_SIZE) }, () =>
        Array<number>(Math.ceil(target.width / COLLISION_CELL_SIZE)).fill(0),
    );
    grid.forEach((row, y) =>
        row.forEach((value, x) => {
            if (value !== 1) return;
            const left = (x * COLLISION_CELL_SIZE * target.width) / source.width;
            const top = (y * COLLISION_CELL_SIZE * target.height) / source.height;
            const right = (Math.min((x + 1) * COLLISION_CELL_SIZE, source.width) * target.width) / source.width;
            const bottom = (Math.min((y + 1) * COLLISION_CELL_SIZE, source.height) * target.height) / source.height;
            for (
                let row = Math.floor(top / COLLISION_CELL_SIZE);
                row < Math.ceil(bottom / COLLISION_CELL_SIZE);
                row++
            ) {
                for (
                    let column = Math.floor(left / COLLISION_CELL_SIZE);
                    column < Math.ceil(right / COLLISION_CELL_SIZE);
                    column++
                ) {
                    if (result[row]?.[column] !== undefined) result[row][column] = 1;
                }
            }
        }),
    );
    return result;
}

function canResizeImage(
    scene: GameScene,
    entity: Entity,
    size: EntityDimensions,
    collisionGrid: number[][] | undefined,
    position: { x: number; y: number } = entity,
): boolean {
    const wrapper = scene.getGameMapFrontWrapper();
    if (
        !entity.canEdit ||
        !scene
            .getEntityPermissions()
            .canEdit(
                { x: Math.ceil(position.x + size.width / 2), y: Math.ceil(position.y + size.height / 2) },
                size.width,
                size.height,
                !collisionGrid,
            ) ||
        wrapper.isOutOfMapBounds(position.x, position.y, size.width, size.height)
    ) {
        return false;
    }
    const previousGrid = entity.getCollisionGrid();
    const tile = wrapper.getTileDimensions();
    return (
        collisionGrid?.every((row, y) =>
            row.every(
                (value, x) =>
                    value !== 1 ||
                    previousGrid?.[
                        Math.floor((position.y + y * tile.height) / tile.height) - Math.floor(entity.y / tile.height)
                    ]?.[Math.floor((position.x + x * tile.width) / tile.width) - Math.floor(entity.x / tile.width)] ===
                        1 ||
                    wrapper.isSpaceAvailable(position.x + x * tile.width, position.y + y * tile.height),
            ),
        ) ?? true
    );
}

/**
 * Official back/map-storage do not persist per-instance scale. Upload a resized prefab,
 * then replace only this instance using native commands, grouped for undo/redo.
 */
export async function resizePlacedImage(
    scene: GameScene,
    entity: Entity,
    size: EntityDimensions,
    signal: AbortSignal,
    position?: { x: number; y: number },
): Promise<void> {
    signal.throwIfAborted();
    const prefab = entity.getPrefab();
    const connection = scene.connection;
    const wamFile = scene.getGameMap().getWamFile();
    if (
        !isPlacedImageSizeValid(size) ||
        prefab.type !== "Custom" ||
        prefab.collisionRectangles ||
        !connection ||
        !wamFile
    ) {
        throw new PlacedImageResizeError("Cannot resize this image");
    }
    if (
        entity.width === size.width &&
        entity.height === size.height &&
        (!position || (position.x === entity.x && position.y === entity.y))
    )
        return;
    const originalPosition = { x: entity.x, y: entity.y };
    const source = { width: entity.width, height: entity.height };
    if (source.width <= 0 || source.height <= 0) throw new PlacedImageResizeError("Image is not loaded");
    const collisionGrid = resizeImageCollisionGrid(prefab.collisionGrid, source, size);
    if (!canResizeImage(scene, entity, size, collisionGrid, position))
        throw new PlacedImageResizeError("Image cannot fit here");

    const response = await fetch(prefab.imagePath, { signal });
    if (!response.ok) throw new Error("Could not load image");
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    try {
        signal.throwIfAborted();
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not resize image");
        context.drawImage(bitmap, 0, 0, size.width, size.height);
    } finally {
        bitmap.close();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png");
    });
    const file = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    const id = uuid();
    const entities = scene.getGameMapFrontWrapper().getEntitiesManager();
    const collections = scene.getEntitiesCollectionsManager();
    const manager = scene.getMapEditorModeManager();
    const upload = new UploadEntityFrontCommand(
        {
            id,
            file,
            name: `${prefab.name} (${size.width}×${size.height})`,
            tags: [...prefab.tags],
            imagePath: `${id}.png`,
            direction: CustomEntityDirection[prefab.direction],
            collisionGrid,
            depthOffset: Math.round((prefab.depthOffset ?? 0) * (size.height / source.height)),
            color: prefab.color,
        },
        entities,
        collections,
    );
    // Subscribe before sending: the image must be saved before we replace the original.
    const acknowledgement = firstValueFrom(
        connection.editMapCommandMessageStream.pipe(
            filter((message) => message.id === upload.commandId),
            timeout(15000),
            takeUntil(fromEvent(signal, "abort")),
        ),
    );
    const [ack] = await Promise.all([acknowledgement, manager.executeCommands([upload], false)]);
    signal.throwIfAborted();
    if (ack.editMapMessage?.message?.$case !== "uploadEntityMessage") {
        throw new PlacedImageResizeError("Image upload was rejected");
    }

    // A collaborator may have moved/deleted the instance during the upload.
    const resizedPrefab = await collections.getEntityPrefab("custom entities", id);
    signal.throwIfAborted();
    if (!resizedPrefab) throw new Error("Resized image was not found");
    // Preload the exact saved pixels so local rendering never races the HTTP image loader.
    scene.textures.addCanvas(resizedPrefab.imagePath, canvas);
    await manager.executeCommands(() => {
        signal.throwIfAborted();
        const current = entities.getEntities().get(entity.entityId);
        if (
            current !== entity ||
            (position && (current.x !== originalPosition.x || current.y !== originalPosition.y)) ||
            !canResizeImage(scene, current, size, collisionGrid, position)
        ) {
            throw new PlacedImageResizeError("Image changed during resize");
        }
        const data = structuredClone(current.getEntityData());
        return [
            new DeleteEntityFrontCommand(wamFile, entity.entityId, undefined, entities),
            new CreateEntityFrontCommand(
                wamFile,
                entity.entityId,
                { ...data, ...position, prefabRef: { collectionName: resizedPrefab.collectionName, id } },
                undefined,
                entities,
                size,
            ),
        ];
    });
}
