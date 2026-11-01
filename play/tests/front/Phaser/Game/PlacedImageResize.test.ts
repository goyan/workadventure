import { afterEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { mock } from "vitest-mock-extended";
import type { EntityPrefab } from "@workadventure/map-editor";
import { WamFile } from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { EntitiesManager } from "../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import type { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";
import type { MapEditorModeManager } from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager";
import type { RoomConnection } from "../../../../src/front/Connection/RoomConnection";
import { gameManager } from "../../../../src/front/Phaser/Game/GameManager";
import {
    isPlacedImageSizeValid,
    resizeImageCollisionGrid,
    resizePlacedImage,
} from "../../../../src/front/Phaser/Game/MapEditor/PlacedImageResize";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("Placed image collisions", () => {
    it("scales solid cells while retaining empty cells", () => {
        expect(resizeImageCollisionGrid([[1, 0]], { width: 64, height: 32 }, { width: 128, height: 64 })).toEqual([
            [1, 1, 0, 0],
            [1, 1, 0, 0],
        ]);
    });

    it("keeps thin scaled collisions and clips partial source cells to the image", () => {
        expect(resizeImageCollisionGrid([[0, 1]], { width: 48, height: 32 }, { width: 96, height: 32 })).toEqual([
            [0, 0, 1],
        ]);
        expect(resizeImageCollisionGrid([[0, 1]], { width: 64, height: 32 }, { width: 16, height: 8 })).toEqual([[1]]);
    });

    it("keeps a floating image collision free", () => {
        expect(
            resizeImageCollisionGrid(undefined, { width: 64, height: 32 }, { width: 128, height: 64 }),
        ).toBeUndefined();
    });

    it.each([0, -1, 1.5, NaN, Infinity, 4097])("rejects an invalid dimension: %s", (width) => {
        expect(isPlacedImageSizeValid({ width, height: 32 })).toBe(false);
    });
});

function fixture() {
    const scene = mock<GameScene>();
    const connection = mock<RoomConnection>();
    const commands = new Subject<EditMapCommandMessage>();
    Object.defineProperty(connection, "editMapCommandMessageStream", { value: commands.asObservable() });
    scene.connection = connection;
    const wrapper = mock<ReturnType<GameScene["getGameMapFrontWrapper"]>>();
    scene.getGameMapFrontWrapper.mockReturnValue(wrapper);
    wrapper.getTileDimensions.mockReturnValue({ width: 32, height: 32 });
    wrapper.isSpaceAvailable.mockReturnValue(true);
    const permissions = mock<ReturnType<GameScene["getEntityPermissions"]>>();
    permissions.canEdit.mockReturnValue(true);
    scene.getEntityPermissions.mockReturnValue(permissions);
    const entities = mock<EntitiesManager>();
    wrapper.getEntitiesManager.mockReturnValue(entities);
    const collections = mock<EntitiesCollectionsManager>();
    scene.getEntitiesCollectionsManager.mockReturnValue(collections);
    scene.getCustomEntityCollectionUrl.mockReturnValue("https://maps.test/entities/collection.json");
    vi.spyOn(gameManager, "getCurrentGameScene").mockReturnValue(scene);
    const prefab: EntityPrefab = {
        id: "source",
        name: "Logo",
        tags: ["Custom"],
        type: "Custom",
        direction: "Down",
        imagePath: "https://maps.test/logo.png",
        collectionName: "custom entities",
        color: "",
        collisionGrid: [[1, 0]],
        depthOffset: -32,
    };
    const data = {
        x: 32,
        y: 64,
        name: "Entrance",
        prefabRef: { id: "source", collectionName: "custom entities" },
        properties: [],
        depthStep: 0,
    };
    const entity = mock<Entity>({ entityId: "image", x: 32, y: 64, width: 64, height: 32 });
    Object.defineProperty(entity, "canEdit", { value: true });
    entity.getPrefab.mockReturnValue(prefab);
    entity.getEntityData.mockReturnValue(data);
    entity.getCollisionGrid.mockReturnValue(prefab.collisionGrid);
    const rendered = new Map([["image", entity]]);
    entities.getEntities.mockReturnValue(rendered);
    const wamFile = new WamFile({
        version: "1",
        mapUrl: "map.tmj",
        areas: [],
        entities: { image: data },
        entityCollections: [],
    });
    const gameMap = mock<ReturnType<GameScene["getGameMap"]>>();
    gameMap.getWamFile.mockReturnValue(wamFile);
    scene.getGameMap.mockReturnValue(gameMap);
    const manager = mock<MapEditorModeManager>();
    scene.getMapEditorModeManager.mockReturnValue(manager);
    manager.executeCommands.mockImplementation(async (commands) => {
        const batch = typeof commands === "function" ? commands() : commands;
        await batch.reduce(async (previous, command) => {
            await previous;
            await command.execute();
            command.emitEvent(connection);
        }, Promise.resolve());
    });
    const canvasContext = mock<CanvasRenderingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(canvasContext);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
        callback(mock<Blob>({ arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer) })),
    );
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(mock<ImageBitmap>()));
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(mock<Response>({ ok: true, blob: vi.fn().mockResolvedValue(mock<Blob>()) })),
    );
    scene.textures = mock<Phaser.Textures.TextureManager>();
    collections.addUploadedEntity.mockImplementation((uploaded) => {
        collections.getEntityPrefab.mockResolvedValue({
            ...uploaded,
            collectionName: "custom entities",
            type: "Custom",
        });
    });
    connection.emitMapEditorUploadEntity.mockImplementation((id, upload) => {
        commands.next({
            id,
            editMapMessage: { message: { $case: "uploadEntityMessage", uploadEntityMessage: upload } },
        });
    });
    return { scene, connection, commands, entity, prefab, manager, wrapper, rendered, data, permissions };
}

describe("Persisted placed image resize", () => {
    it("uploads scaled pixels and metadata before replacing only the selected instance", async () => {
        const f = fixture();
        await resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal);
        const upload = f.connection.emitMapEditorUploadEntity.mock.calls[0][1];
        expect(upload).toMatchObject({
            collisionGrid: [
                [1, 1, 0, 0],
                [1, 1, 0, 0],
            ],
            depthOffset: -64,
            tags: ["Custom"],
        });
        expect(
            f.manager.executeCommands.mock.calls.map(([batch, history]) => [
                typeof batch === "function" ? "factory" : batch.length,
                history,
            ]),
        ).toEqual([
            [1, false],
            ["factory", undefined],
        ]);
        expect(f.connection.emitMapEditorCreateEntity.mock.calls[0][2]).toMatchObject({
            ...f.data,
            prefabRef: { id: upload.id, collectionName: "custom entities" },
        });
        expect(f.permissions.canEdit.mock.calls[0]).toEqual([{ x: 96, y: 96 }, 128, 64, false]);
    });

    it("does not replace the image before the server confirms the upload", async () => {
        const f = fixture();
        let rejectUpload: (() => void) | undefined;
        f.connection.emitMapEditorUploadEntity.mockImplementation((id) => {
            rejectUpload = () =>
                f.commands.next({
                    id,
                    editMapMessage: {
                        message: { $case: "errorCommandMessage", errorCommandMessage: { reason: "denied" } },
                    },
                });
        });
        const resizing = resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal);
        const rejected = expect(resizing).rejects.toThrow("Image upload was rejected");
        await vi.waitFor(() => expect(rejectUpload).toBeDefined());
        expect(f.connection.emitMapEditorDeleteEntity.mock.calls).toHaveLength(0);
        rejectUpload?.();
        await rejected;
        expect(f.connection.emitMapEditorDeleteEntity.mock.calls).toHaveLength(0);
    });

    it("checks newly occupied collision cells without ignoring another obstacle", async () => {
        const f = fixture();
        f.wrapper.isSpaceAvailable.mockReturnValue(false);
        await expect(
            resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal),
        ).rejects.toThrow("Image cannot fit here");
        expect(f.connection.emitMapEditorUploadEntity.mock.calls).toHaveLength(0);
    });

    it("rejects a stale deleted instance after upload", async () => {
        const f = fixture();
        f.connection.emitMapEditorUploadEntity.mockImplementation((id, upload) => {
            f.rendered.clear();
            f.commands.next({
                id,
                editMapMessage: { message: { $case: "uploadEntityMessage", uploadEntityMessage: upload } },
            });
        });
        await expect(
            resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal),
        ).rejects.toThrow("Image changed during resize");
        expect(f.connection.emitMapEditorDeleteEntity.mock.calls).toHaveLength(0);
    });

    it("aborts before uploading when the panel has closed", async () => {
        const f = fixture();
        const controller = new AbortController();
        controller.abort();
        await expect(
            resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, controller.signal),
        ).rejects.toThrow();
        expect(f.connection.emitMapEditorUploadEntity.mock.calls).toHaveLength(0);
    });

    it("cleans up its acknowledgement listener and preserves the original when closed during upload", async () => {
        const f = fixture();
        f.connection.emitMapEditorUploadEntity.mockImplementation(() => {});
        const controller = new AbortController();
        const resizing = resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, controller.signal);
        const rejected = expect(resizing).rejects.toThrow();
        await vi.waitFor(() => expect(f.connection.emitMapEditorUploadEntity.mock.calls).toHaveLength(1));
        controller.abort();
        await rejected;
        expect(f.commands.observed).toBe(false);
        expect(f.connection.emitMapEditorDeleteEntity.mock.calls).toHaveLength(0);
    });

    it("uses properties changed by a collaborator during upload", async () => {
        const f = fixture();
        f.connection.emitMapEditorUploadEntity.mockImplementation((id, upload) => {
            f.data.name = "Updated entrance";
            f.commands.next({
                id,
                editMapMessage: { message: { $case: "uploadEntityMessage", uploadEntityMessage: upload } },
            });
        });
        await resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal);
        expect(f.connection.emitMapEditorCreateEntity.mock.calls[0][2].name).toBe("Updated entrance");
    });

    it("persists a corner resize with its opposite corner fixed", async () => {
        const f = fixture();
        f.prefab.collisionGrid = undefined;
        f.entity.getCollisionGrid.mockReturnValue(undefined);
        await resizePlacedImage(f.scene, f.entity, { width: 96, height: 48 }, new AbortController().signal, {
            x: 0,
            y: 48,
        });
        expect(f.connection.emitMapEditorCreateEntity.mock.calls[0][2]).toMatchObject({ x: 0, y: 48 });
        expect(f.permissions.canEdit.mock.calls[0]).toEqual([{ x: 48, y: 72 }, 96, 48, true]);
    });

    it("checks obstacles in world cells when the top-left corner changes", async () => {
        const f = fixture();
        f.wrapper.isSpaceAvailable.mockReturnValue(false);
        await expect(
            resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal, {
                x: 0,
                y: 32,
            }),
        ).rejects.toThrow("Image cannot fit here");
        expect(f.connection.emitMapEditorUploadEntity.mock.calls).toHaveLength(0);
    });

    it("does not overwrite a collaborator's move during an anchored resize", async () => {
        const f = fixture();
        f.connection.emitMapEditorUploadEntity.mockImplementation((id, upload) => {
            f.entity.x = 96;
            f.commands.next({
                id,
                editMapMessage: { message: { $case: "uploadEntityMessage", uploadEntityMessage: upload } },
            });
        });
        await expect(
            resizePlacedImage(f.scene, f.entity, { width: 128, height: 64 }, new AbortController().signal, {
                x: 0,
                y: 32,
            }),
        ).rejects.toThrow("Image changed during resize");
        expect(f.connection.emitMapEditorDeleteEntity.mock.calls).toHaveLength(0);
    });
});
