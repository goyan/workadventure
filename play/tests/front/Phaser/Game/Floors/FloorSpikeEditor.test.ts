import * as Phaser from "phaser";
import { mock } from "vitest-mock-extended";
import { describe, expect, it, vi } from "vitest";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import type { TileBarriers } from "../../../../../src/front/Utils/TileBarriers";
import { FloorSpike } from "../../../../../src/front/Phaser/Game/Floors/FloorSpike";
import type { FloorEntity } from "../../../../../src/front/Phaser/Game/Floors/FloorSpike";
import { EDITOR_OPEN_AIR_ABOVE_ALPHA } from "../../../../../src/front/Phaser/Game/Floors/LevelFocus";

describe("construction floor rendering", () => {
    it("keeps the floors in the open air in view, seen through above the one edited, then restores the game view", () => {
        const scene = mock<GameScene>();
        const events = new Phaser.Events.EventEmitter();
        scene.events = events;
        const factory = mock<Phaser.GameObjects.GameObjectFactory>();
        const label = mock<Phaser.GameObjects.Text>();
        label.setDepth.mockReturnValue(label);
        label.setPosition.mockReturnValue(label);
        label.setText.mockReturnValue(label);
        label.setVisible.mockReturnValue(label);
        factory.text.mockReturnValue(label);
        const veil = mock<Phaser.GameObjects.Rectangle>();
        veil.setOrigin.mockReturnValue(veil);
        veil.setAlpha.mockReturnValue(veil);
        veil.setVisible.mockReturnValue(veil);
        veil.setDepth.mockReturnValue(veil);
        veil.setPosition.mockReturnValue(veil);
        veil.setSize.mockReturnValue(veil);
        factory.rectangle.mockReturnValue(veil);
        const graphics = mock<Phaser.GameObjects.Graphics>();
        graphics.setDepth.mockReturnValue(graphics);
        factory.graphics.mockReturnValue(graphics);
        scene.add = factory;
        scene.cameras = mock<Phaser.Cameras.Scene2D.CameraManager>();
        scene.cameras.main = mock<Phaser.Cameras.Scene2D.Camera>({
            worldView: new Phaser.Geom.Rectangle(0, 0, 640, 640),
        });
        const slab = (elevation: number): FloorEntity => ({
            x: 160,
            y: 160 - elevation,
            getPrefab: () => ({
                collectionName: "Carte Paliers",
                id: "Carte Paliers:dalle-parquet-clair:Default:Down",
            }),
            getEntityData: () => ({ elevation }),
            setAlpha: vi.fn(),
        });
        const lowerAlpha = vi.fn();
        const upperAlpha = vi.fn();
        const furnitureAlpha = vi.fn();
        const lower = { ...slab(52), setAlpha: lowerAlpha };
        const upper = { ...slab(104), setAlpha: upperAlpha };
        const furniture: FloorEntity = {
            ...upper,
            getPrefab: () => ({ collectionName: "Furniture", id: "chair" }),
            setAlpha: furnitureAlpha,
        };
        let editor = { open: true, level: 52 };
        const floors = new FloorSpike(
            scene,
            () => ({ x: 0, y: 0, setPosition: vi.fn(), setFloorZ: vi.fn() }),
            undefined,
            () => mock<TileBarriers>(),
            () => [lower, upper, furniture],
            () => editor,
            vi.fn(),
            vi.fn(),
        );
        try {
            events.emit(Phaser.Scenes.Events.POST_UPDATE, 0, 1000);
            expect(lowerAlpha).toHaveBeenLastCalledWith(1);
            // No room under these slabs: floors in the open air, kept in view, seen through above the one edited.
            expect(upperAlpha).toHaveBeenLastCalledWith(EDITOR_OPEN_AIR_ABOVE_ALPHA);
            expect(furnitureAlpha).toHaveBeenLastCalledWith(EDITOR_OPEN_AIR_ABOVE_ALPHA);
            editor = { open: true, level: 104 };
            events.emit(Phaser.Scenes.Events.POST_UPDATE, 1000, 1000);
            expect(lowerAlpha).toHaveBeenLastCalledWith(1);
            expect(upperAlpha).toHaveBeenLastCalledWith(1);
            expect(furnitureAlpha).toHaveBeenLastCalledWith(1);
            editor = { open: false, level: 104 };
            events.emit(Phaser.Scenes.Events.POST_UPDATE, 2000, 1000);
            expect(lowerAlpha).toHaveBeenLastCalledWith(1);
            expect(upperAlpha).toHaveBeenLastCalledWith(1);
        } finally {
            floors.destroy();
        }
    });
});
