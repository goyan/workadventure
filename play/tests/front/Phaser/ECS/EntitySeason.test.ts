import { describe, expect, it, vi } from "vitest";
import { Season } from "@workadventure/map-editor";
import { Entity } from "@wa/front/Phaser/ECS/Entity";

vi.mock("@wa/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

describe("seasonal entity texture", () => {
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
