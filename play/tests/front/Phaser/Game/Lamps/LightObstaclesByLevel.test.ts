import { describe, expect, it } from "vitest";
import type { Entity } from "../../../../../src/front/Phaser/ECS/Entity";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";
import { LightObstaclesByLevel } from "../../../../../src/front/Phaser/Game/Lamps/LightObstacleReader";

/** A piece of a wall, or a tall object, as the reader sees it. */
function placed(
    id: string,
    collectionName: string,
    prefabId: string,
    x: number,
    y: number,
    elevation = 0,
    castsShadow = false,
): [string, Entity] {
    const entity = {
        entityId: id,
        x,
        y,
        getElevation: () => elevation,
        getPrefab: () => ({ collectionName, id: prefabId, castsShadow, collisionGrid: [[1]] }),
    };
    return [id, entity as unknown as Entity];
}

const scene = {
    getGameMapFrontWrapper: () => ({ getMapCollisionGrid: () => [[0, 1]] }),
    isDoorOpen: () => false,
} as unknown as GameScene;

const FACADE = "facade-blanc-mid:Default:Down";

describe("LightObstaclesByLevel", () => {
    it("gives a light of a raised floor the walls and tall objects of that floor only, and no tile of the map", () => {
        const obstacles = new LightObstaclesByLevel(scene, () => 32);
        obstacles.read(
            new Map([
                placed("ground-wall", "Carte Murs", `Carte Murs:${FACADE}`, 64, 320),
                placed("upper-wall", "Carte Murs Paliers", `Carte Murs Paliers:${FACADE}`, 64, 44, 52),
                placed("ground-cupboard", "Meubles", "cupboard", 200, 200, 0, true),
                placed("upper-cupboard", "Meubles", "cupboard", 200, 100, 52, true),
            ]),
        );

        const ground = obstacles.at(0);
        const upstairs = obstacles.at(52);
        expect(ground.grid).toEqual([[0, 1]]);
        expect(upstairs.grid).toEqual([]);
        expect(ground.casters.map(({ entityId }) => entityId)).toEqual(["ground-cupboard"]);
        expect(upstairs.casters.map(({ entityId }) => entityId)).toEqual(["upper-cupboard"]);
        expect(ground.walls.length).toBeGreaterThan(0);
        expect(upstairs.walls.length).toBe(ground.walls.length);
        // The wall of the raised floor is where it is drawn: it stands 224 px north of the one of the ground, and
        // 52 px higher on the screen.
        expect(upstairs.walls.map(({ ay }) => ay)).toEqual(ground.walls.map(({ ay }) => ay - 224 - 52));
    });

    it("meets nothing on a stair, or on a floor nothing is placed on", () => {
        const obstacles = new LightObstaclesByLevel(scene, () => 32);
        obstacles.read(new Map([placed("ground-wall", "Carte Murs", `Carte Murs:${FACADE}`, 64, 320)]));

        for (const floorZ of [24, 52]) {
            const open = obstacles.at(floorZ);
            expect(open.grid).toEqual([]);
            expect(open.walls).toEqual([]);
            expect(open.casters).toEqual([]);
        }
    });
});
