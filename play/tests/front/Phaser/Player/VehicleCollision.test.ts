import * as Phaser from "phaser";
import { describe, expect, it } from "vitest";
import { mock } from "vitest-mock-extended";
import {
    ELECTRIC_UNICYCLE_SPEED_FACTOR,
    VEHICLE_SPEED_FACTOR,
    vehiclePhysicsFps,
} from "@wa/front/Phaser/Vehicle/Vehicle";

describe("vehicle collisions", () => {
    it.each([
        [60, VEHICLE_SPEED_FACTOR],
        [30, VEHICLE_SPEED_FACTOR],
        [15, VEHICLE_SPEED_FACTOR],
        [60, ELECTRIC_UNICYCLE_SPEED_FACTOR],
        [30, ELECTRIC_UNICYCLE_SPEED_FACTOR],
        [15, ELECTRIC_UNICYCLE_SPEED_FACTOR],
    ])(
        "stops at thin walls and small obstacles at %i rendered frames per second, %s times walking speed",
        (fps, factor) => {
            for (const walkingSpeed of [9, 27]) {
                for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    for (const size of [2, 8, 32]) {
                        const scene = mock<Phaser.Scene>({ sys: { scale: { width: 1024, height: 1024 } } });
                        const world = new Phaser.Physics.Arcade.World(scene, {});
                        const player = new Phaser.Physics.Arcade.Body(world);
                        player.setSize(16, 16, false);
                        player.position.set(dx < 0 ? 128 : 0, dy < 0 ? 128 : 0);
                        world.setFPS(vehiclePhysicsFps(walkingSpeed, player));
                        world.add(player);
                        const wall = new Phaser.Physics.Arcade.StaticBody(world);
                        wall.setSize(dx ? size : 64, dy ? size : 64, false);
                        wall.position.set(dx ? 64 : 0, dy ? 64 : 0);
                        wall.updateCenter();
                        world.add(wall);
                        world.addCollider(player, wall);
                        const start = { x: player.x, y: player.y };
                        for (let frame = 0; frame < fps; frame += 1) {
                            const speed = walkingSpeed * 20 * factor;
                            player.setVelocity(dx * speed, dy * speed);
                            world.update((frame * 1000) / fps, 1000 / fps);
                        }
                        expect(Math.hypot(player.x - start.x, player.y - start.y)).toBeGreaterThan(0);
                        if (dx > 0) expect(player.right).toBeLessThanOrEqual(wall.x);
                        if (dx < 0) expect(player.x).toBeGreaterThanOrEqual(wall.right);
                        if (dy > 0) expect(player.bottom).toBeLessThanOrEqual(wall.y);
                        if (dy < 0) expect(player.y).toBeGreaterThanOrEqual(wall.bottom);
                        world.destroy();
                    }
                }
            }
        },
    );
});
