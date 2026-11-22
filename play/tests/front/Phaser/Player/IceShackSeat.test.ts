import { describe, expect, it } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import type { GameScene } from "@wa/front/Phaser/Game/GameScene";
import type { Character } from "@wa/front/Phaser/Entity/Character";
import { findSeatOfCharacter, findSeatUnderFeet, getSeats, isSeatTaken } from "@wa/front/Phaser/Player/Seat";
import type { Seat } from "@wa/front/Phaser/Player/Seat";

let frame = 1000;

/** The stool of an ice fishing shack: no object of the map, a seat all the same. */
const stool: Seat = {
    id: "ice-shack:1",
    entityId: "ice-shack:1",
    direction: PositionMessage_Direction.RIGHT,
    depth: 202,
    trigger: "key",
    feet: { x: 300, y: 208 },
    elevation: 0,
};

/** A map without objects, with one shack whose stool is held by the server. */
function sceneWithShack(others: Character[] = []): GameScene {
    frame += 1;
    return {
        game: { loop: { frame } },
        wamFile: { settings: { categories: undefined } },
        getGameMapFrontWrapper: () => ({
            getTileDimensions: () => ({ width: 32, height: 32 }),
            getEntitiesManager: () => ({ getEntities: () => new Map() }),
        }),
        iceShackManager: { seats: () => [stool] },
        MapPlayersByKey: new Map(others.map((other, index) => [index + 2, other])),
    } as unknown as GameScene;
}

/** A character standing at (x, y), its feet 8 px under it. */
function character(x: number, y: number, seated = false): Character {
    return {
        x,
        y,
        isSeated: () => seated,
        getPositionForFeet: (feet: { x: number; y: number }) => ({ x: feet.x, y: feet.y - 8 }),
    } as unknown as Character;
}

describe("the stool of an ice fishing shack", () => {
    it("is one of the seats of the map", () => {
        expect(getSeats(sceneWithShack()).map((seat) => seat.id)).toContain("ice-shack:1");
    });

    it("is offered to a player who walks onto it", () => {
        expect(findSeatUnderFeet(sceneWithShack(), { x: 302, y: 207 })?.id).toBe("ice-shack:1");
    });

    it("shows another player who stands still on it as seated: no message of its own", () => {
        expect(findSeatOfCharacter(sceneWithShack(), character(300, 200))?.id).toBe("ice-shack:1");
        expect(findSeatOfCharacter(sceneWithShack(), character(320, 200))).toBeUndefined();
    });

    it("is taken while somebody sits on it", () => {
        const scene = sceneWithShack([character(300, 200, true)]);
        expect(isSeatTaken(scene, stool)).toBe(true);
    });
});
