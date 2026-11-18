import { describe, expect, it, vi } from "vitest";
import { Season } from "@workadventure/map-editor";
import { Entity } from "@wa/front/Phaser/ECS/Entity";

vi.mock("@wa/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

describe("seasonal entity texture", () => {
    it("checks shelter at the trunk rather than the transparent margin over a neighbouring room", () => {
        const setTexture = vi.fn();
        const isOutdoorAt = vi.fn((_x: number, y: number): boolean => y < 1970);
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            entityId: "tree-along-office",
            x: 3871,
            y: 1790,
            frame: { realWidth: 130, realHeight: 196 },
            displayWidth: 130,
            displayHeight: 196,
            prefab: {
                id: "Nature:seasonal-1:Default:Down",
                imagePath: "oak.png",
                depthOffset: -27,
                seasonal: { summer: "oak.png", winter: "oak-snow.png" },
            },
            scene: {
                getOutdoorGrid: () => ({ isOutdoorAt }),
                textures: { exists: () => true },
            },
            setTexture,
        }) as unknown as Entity;
        entity.setSeason(Season.Winter);
        expect(isOutdoorAt).toHaveBeenCalledWith(3936, 1958);
        expect(setTexture).toHaveBeenLastCalledWith(expect.stringContaining("tree-snow:oak.png"));
    });
    it("keeps its season on refresh, falls back during loading, and leaves ordinary entities unchanged", () => {
        const loaded = new Set(["summer.png"]);
        const setTexture = vi.fn();
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            prefab: { id: "Office:plant", imagePath: "summer.png", seasonal: { autumn: "autumn.png" } },
            scene: { textures: { exists: (key: string): boolean => loaded.has(key) } },
            setTexture,
        }) as Entity;
        entity.setSeason(Season.Autumn);
        expect(setTexture).toHaveBeenLastCalledWith("summer.png");
        loaded.add("autumn.png");
        entity.showPrefabTexture();
        expect(setTexture).toHaveBeenLastCalledWith("autumn.png");
        Object.assign(entity, { prefab: { id: "Office:pine", imagePath: "pine.png" } });
        entity.setSeason(Season.Winter);
        entity.showPrefabTexture();
        expect(setTexture).toHaveBeenLastCalledWith("pine.png");
    });
    it("keeps ordinary indoor furniture unchanged when loaded during partial snowfall", () => {
        const setTexture = vi.fn();
        const exists = vi.fn(() => true);
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            entityId: "office-desk",
            prefab: { id: "Office:desk", imagePath: "desk.png" },
            scene: { textures: { exists } },
            setTexture,
        }) as unknown as Entity;
        entity.setSeason(Season.Winter, 0.5);
        entity.showPrefabTexture();
        expect(setTexture).toHaveBeenLastCalledWith("desk.png");
        expect(exists).not.toHaveBeenCalledWith(expect.stringContaining("tree-snow:"));
    });
    it("leaves a seasonal tree under a roof bare and updates when its shelter changes", () => {
        const setTexture = vi.fn();
        let outdoor = false;
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            entityId: "sheltered-oak",
            x: 128,
            y: 128,
            frame: { realWidth: 32, realHeight: 64 },
            displayWidth: 32,
            displayHeight: 64,
            prefab: {
                id: "Nature:tree-1-2:Default:Down",
                imagePath: "oak.png",
                seasonal: { summer: "oak.png", winter: "oak-snow.png" },
            },
            scene: {
                getOutdoorGrid: () => ({ isOutdoorAt: () => outdoor }),
                textures: { exists: () => true },
            },
            setTexture,
        }) as unknown as Entity;
        entity.setSeason(Season.Winter, 0.5);
        expect(setTexture).toHaveBeenLastCalledWith("oak.png");
        outdoor = true;
        entity.setSeason(Season.Winter, 0.5);
        expect(setTexture).toHaveBeenLastCalledWith(expect.stringContaining("tree-snow:oak.png:"));
        outdoor = false;
        entity.setSeason(Season.Winter);
        expect(setTexture).toHaveBeenLastCalledWith("oak.png");
    });
    it("shows a tree under snow as its own summer image covered with snow", () => {
        const setTexture = vi.fn();
        const textures = new Set(["oak.png", "tree-snow:oak.png"]);
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            prefab: {
                id: "Nature:tree-1-2:Default:Down",
                imagePath: "oak.png",
                seasonal: { summer: "oak.png", winter: "oak-snow.png" },
            },
            scene: { textures: { exists: (key: string): boolean => textures.has(key) } },
            setTexture,
        }) as Entity;
        entity.setSeason(Season.Winter);
        expect(setTexture).toHaveBeenLastCalledWith("tree-snow:oak.png");
    });
});
