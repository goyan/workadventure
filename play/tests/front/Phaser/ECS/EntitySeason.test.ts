import { describe, expect, it, vi } from "vitest";
import { Season } from "@workadventure/map-editor";
import { Entity } from "@wa/front/Phaser/ECS/Entity";

vi.mock("@wa/front/Phaser/Game/GameScene", () => ({ GameScene: class {} }));

describe("seasonal entity texture", () => {
    it("keeps its season on refresh, falls back during loading, and leaves ordinary entities unchanged", () => {
        const loaded = new Set(["summer.png"]);
        const setTexture = vi.fn();
        const entity = Object.assign(Object.create(Entity.prototype) as Entity, {
            prefab: { imagePath: "summer.png", seasonal: { autumn: "autumn.png" } },
            scene: { textures: { exists: (key: string): boolean => loaded.has(key) } },
            setTexture,
        }) as Entity;
        entity.setSeason(Season.Autumn);
        expect(setTexture).toHaveBeenLastCalledWith("summer.png");
        loaded.add("autumn.png");
        entity.showPrefabTexture();
        expect(setTexture).toHaveBeenLastCalledWith("autumn.png");
        Object.assign(entity, { prefab: { imagePath: "pine.png" } });
        entity.setSeason(Season.Winter);
        entity.showPrefabTexture();
        expect(setTexture).toHaveBeenLastCalledWith("pine.png");
    });
});
