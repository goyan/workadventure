import type { CollisionRectangle, EntityDimensions, EntityPrefab } from "@workadventure/map-editor";
import { CustomEntityDirection } from "@workadventure/messages";
import { filter, firstValueFrom, fromEvent, takeUntil, timeout } from "rxjs";
import { v4 as uuid } from "uuid";
import type { Entity } from "../../ECS/Entity";
import type { GameScene } from "../GameScene";
import { CreateEntityFrontCommand } from "./Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "./Commands/Entity/DeleteEntityFrontCommand";
import { UploadEntityFrontCommand } from "./Commands/Entity/UploadEntityFrontCommand";
import { DeleteCustomEntityFrontCommand } from "./Commands/Entity/DeleteCustomEntityFrontCommand";
import { getResizedFrom, resizedVariantName, resizedVariantTag, resizedVariantTags } from "./PlacedImageVariants";

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

/** Scales rectangles in pixels (the water of a pool) from the original size to the new one. */
export function resizeImageRectangles(
    rectangles: CollisionRectangle[] | undefined,
    source: EntityDimensions,
    target: EntityDimensions,
): CollisionRectangle[] | undefined {
    if (!rectangles) return undefined;
    const sx = target.width / source.width;
    const sy = target.height / source.height;
    return rectangles.map((r) => ({
        x: Math.round(r.x * sx),
        y: Math.round(r.y * sy),
        width: Math.max(1, Math.round(r.width * sx)),
        height: Math.max(1, Math.round(r.height * sy)),
    }));
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
    const entities = scene.getGameMapFrontWrapper().getEntitiesManager();
    const collections = scene.getEntitiesCollectionsManager();
    const manager = scene.getMapEditorModeManager();
    if (!manager) throw new Error("The map editor is not available");

    // Always from the original image: a resized copy is already resampled, each new step would blur it more.
    const originalId = getResizedFrom(prefab) ?? prefab.id;
    const original =
        originalId === prefab.id
            ? prefab
            : ((await collections.getEntityPrefab("custom entities", originalId)) ?? prefab);
    signal.throwIfAborted();
    const variantTag = resizedVariantTag(original.id, size);
    // The same image at the same size already exists: reuse it rather than uploading one more copy.
    const existing = await collections.findCustomPrefabByTag(variantTag);
    signal.throwIfAborted();

    const prepared = existing ? undefined : await drawResizedImage(original, size, signal);
    const collisionGrid = existing ? existing.collisionGrid : prepared?.collisionGrid;
    if (!canResizeImage(scene, entity, size, collisionGrid, position))
        throw new PlacedImageResizeError("Image cannot fit here");
    const resizedPrefab: EntityPrefab = existing ?? (await uploadResizedImage(scene, original, size, prepared, signal));
    const id = resizedPrefab.id;

    // The copy the instance shows now is not in the library: it is deleted from the server once no other instance of
    // this map uses it (the other maps cannot be checked from here). Undoing would bring back that deleted image, so
    // this resize stays out of the undo history: resizing again starts from the original, nothing is lost.
    const dropsPrevious =
        getResizedFrom(prefab) !== undefined &&
        prefab.id !== id &&
        wamFile
            .getGameMapEntities()
            .findEntitiesByPrefabId(prefab.id)
            .every((key) => key === entity.entityId);

    // A collaborator may have moved/deleted the instance during the upload.
    await manager.executeCommands(
        () => {
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
        },
        dropsPrevious ? false : undefined,
    );

    if (dropsPrevious && wamFile.getGameMapEntities().findEntitiesByPrefabId(prefab.id).length === 0) {
        await manager.executeCommands(
            [new DeleteCustomEntityFrontCommand({ id: prefab.id }, wamFile, entities, collections)],
            false,
        );
    }
}

interface PreparedResize {
    canvas: HTMLCanvasElement;
    collisionGrid: number[][] | undefined;
    depthOffset: number;
    water: CollisionRectangle[] | undefined;
}

/**
 * Draws the original image at the new size (every frame of an animated strip alike), and scales its collision grid,
 * depth offset and water from the original size.
 */
async function drawResizedImage(
    original: EntityPrefab,
    size: EntityDimensions,
    signal: AbortSignal,
): Promise<PreparedResize> {
    const response = await fetch(original.imagePath, { signal });
    if (!response.ok) throw new Error("Could not load image");
    const bitmap = await createImageBitmap(await response.blob());
    const frameCount = original.animation?.frameCount ?? 1;
    const source = { width: bitmap.width / frameCount, height: bitmap.height };
    const canvas = document.createElement("canvas");
    canvas.width = size.width * frameCount;
    canvas.height = size.height;
    try {
        signal.throwIfAborted();
        if (source.width <= 0 || source.height <= 0) throw new PlacedImageResizeError("Image is not loaded");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not resize image");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    } finally {
        bitmap.close();
    }
    return {
        canvas,
        collisionGrid: resizeImageCollisionGrid(original.collisionGrid, source, size),
        depthOffset: Math.round((original.depthOffset ?? 0) * (size.height / source.height)),
        water: resizeImageRectangles(original.water, source, size),
    };
}

/** Uploads the resized copy, waits for the server to save it, and returns it as the library knows it. */
async function uploadResizedImage(
    scene: GameScene,
    original: EntityPrefab,
    size: EntityDimensions,
    prepared: PreparedResize | undefined,
    signal: AbortSignal,
): Promise<EntityPrefab> {
    const connection = scene.connection;
    const manager = scene.getMapEditorModeManager();
    if (!prepared || !connection || !manager) throw new Error("The map editor is not available");
    const { canvas, collisionGrid, depthOffset, water } = prepared;
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image"))), "image/png");
    });
    const file = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    const id = uuid();
    const collections = scene.getEntitiesCollectionsManager();
    const upload = new UploadEntityFrontCommand(
        {
            id,
            file,
            name: resizedVariantName(original.name, size),
            tags: resizedVariantTags(original.tags, original.id, size),
            imagePath: `${id}.png`,
            direction: CustomEntityDirection[original.direction],
            collisionGrid,
            depthOffset,
            color: original.color,
            animation: original.animation,
            // The copy is drawn and used like the original: a rink or a rug stays under the players, a pool keeps
            // its water, a seat its setting.
            layer: original.layer,
            water,
            sittable: original.sittable,
        },
        scene.getGameMapFrontWrapper().getEntitiesManager(),
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
    const resizedPrefab = await collections.getEntityPrefab("custom entities", id);
    signal.throwIfAborted();
    if (!resizedPrefab) throw new Error("Resized image was not found");
    // Preload the exact saved pixels so local rendering never races the HTTP image loader.
    scene.textures.addCanvas(resizedPrefab.imagePath, canvas);
    return resizedPrefab;
}
