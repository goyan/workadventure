import type { SwitchPropertyData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    entityStateKeysOf,
    resolveSwitchTargets,
    roomIdAt,
    switchPressValue,
    type SwitchableTarget,
} from "../../../../../src/front/Phaser/Game/Switches/SwitchTargets";

const lamp = (id: string, x: number, y: number, elevation = 0): SwitchableTarget => ({
    id,
    point: { x, y },
    elevation,
    keys: ["on"],
});
const property = (targets: SwitchPropertyData["targets"]): SwitchPropertyData => ({
    id: "p",
    type: "switchPropertyData",
    key: "on",
    targets,
});
const room = "room";
/** A lamp of the room of the switch. */
const inRoom = (id: string, elevation = 0): SwitchableTarget => ({ ...lamp(id, 150, 150, elevation), roomId: "room" });

describe("entityStateKeysOf", () => {
    it("gives an RGB lamp the key `on`", () => {
        expect(entityStateKeysOf({ lamp: { kind: "rgb" } })).toEqual(["on"]);
    });

    it("gives nothing to the lamps that follow the music, nor to a plain object", () => {
        expect(entityStateKeysOf({ lamp: { kind: "disco" } })).toEqual([]);
        expect(entityStateKeysOf({})).toEqual([]);
    });
});

describe("resolveSwitchTargets", () => {
    it("commands the listed objects, wherever they are", () => {
        const candidates = [lamp("a", 0, 0), lamp("b", 5000, 5000, 64), lamp("c", 150, 150)];
        const targets = resolveSwitchTargets(property({ mode: "ids", ids: ["a", "b"] }), room, 0, candidates);
        expect(targets.map((target) => target.id)).toEqual(["a", "b"]);
    });

    it("leaves out a listed object that is gone", () => {
        const targets = resolveSwitchTargets(property({ mode: "ids", ids: ["a", "deleted"] }), room, 0, [
            lamp("a", 0, 0),
        ]);
        expect(targets.map((target) => target.id)).toEqual(["a"]);
    });

    it("commands the objects of its room in zone mode", () => {
        const candidates = [inRoom("in"), inRoom("edge"), lamp("out", 301, 150)];
        const targets = resolveSwitchTargets(property({ mode: "zone" }), room, 0, candidates);
        expect(targets.map((target) => target.id)).toEqual(["in", "edge"]);
    });

    it("only commands the objects of its own floor in zone mode", () => {
        const candidates = [inRoom("ground"), inRoom("upstairs", 64)];
        expect(resolveSwitchTargets(property({ mode: "zone" }), room, 0, candidates).map((t) => t.id)).toEqual([
            "ground",
        ]);
        expect(resolveSwitchTargets(property({ mode: "zone" }), room, 64, candidates).map((t) => t.id)).toEqual([
            "upstairs",
        ]);
    });

    it("commands nothing in zone mode out of any room", () => {
        expect(resolveSwitchTargets(property({ mode: "zone" }), undefined, 0, [inRoom("a")])).toEqual([]);
    });

    it("leaves out an object that has not the state the switch commands", () => {
        const plain: SwitchableTarget = {
            id: "plain",
            point: { x: 150, y: 150 },
            elevation: 0,
            keys: [],
            roomId: "room",
        };
        expect(resolveSwitchTargets(property({ mode: "zone" }), room, 0, [plain])).toEqual([]);
        expect(resolveSwitchTargets(property({ mode: "ids", ids: ["plain"] }), room, 0, [plain])).toEqual([]);
    });
});

describe("switchPressValue", () => {
    const targets = [lamp("a", 0, 0), lamp("b", 0, 0)];

    it("puts everything out when one target is on", () => {
        expect(switchPressValue(targets, (id) => id === "a")).toBe("false");
    });

    it("lights everything when every target is out", () => {
        expect(switchPressValue(targets, () => false)).toBe("true");
    });

    it("has nothing to do without target", () => {
        expect(switchPressValue([], () => true)).toBeUndefined();
    });
});

describe("roomIdAt", () => {
    const office = { areaId: "office", x: 4224, y: 2240, width: 192, height: 224 };
    const hall = { areaId: "hall", x: 4224, y: 1900, width: 192, height: 200 };
    const rooms = [office, hall];

    it("is the smallest room that holds the point", () => {
        const desk = { areaId: "desk", x: 4256, y: 2300, width: 64, height: 64 };
        expect(roomIdAt({ x: 4270, y: 2310 }, [office, desk])).toBe("desk");
        expect(roomIdAt({ x: 4400, y: 2400 }, [office, desk])).toBe("office");
    });

    it("gives a lamp hung on the wall above a room to that room", () => {
        // The lamp of the user: its light leaves 13 px above the top edge of the room.
        expect(roomIdAt({ x: 4240, y: 2227 }, rooms)).toBe("office");
        // Up to the top of a wall of 4 tiles, not higher.
        expect(roomIdAt({ x: 4240, y: 2240 - 128 }, [office])).toBe("office");
        expect(roomIdAt({ x: 4240, y: 2240 - 129 }, [office])).toBeUndefined();
    });

    it("gives an object just beyond a side or the bottom of a room to that room, a tile at most", () => {
        expect(roomIdAt({ x: 4224 - 32, y: 2300 }, rooms)).toBe("office");
        expect(roomIdAt({ x: 4224 - 33, y: 2300 }, rooms)).toBeUndefined();
        expect(roomIdAt({ x: 4300, y: 2464 + 32 }, rooms)).toBe("office");
        expect(roomIdAt({ x: 4300, y: 2464 + 33 }, rooms)).toBeUndefined();
    });

    it("gives an object between two rooms to the nearest one", () => {
        // 20 px under the hall, 120 px above the office.
        expect(roomIdAt({ x: 4300, y: 2120 }, rooms)).toBe("hall");
        expect(roomIdAt({ x: 4300, y: 2200 }, rooms)).toBe("office");
    });

    it("is no room far from any", () => {
        expect(roomIdAt({ x: 100, y: 100 }, rooms)).toBeUndefined();
        expect(roomIdAt({ x: 4300, y: 2300 }, [])).toBeUndefined();
    });
});

describe("resolveSwitchTargets by room", () => {
    it("commands the lamps whose room is its own, the lamp on the wall included", () => {
        const onWall: SwitchableTarget = { ...lamp("wall", 4240, 2227), roomId: "office" };
        const elsewhere: SwitchableTarget = { ...lamp("else", 0, 0), roomId: "hall" };
        const nowhere: SwitchableTarget = lamp("nowhere", 0, 0);
        const targets = resolveSwitchTargets(property({ mode: "zone" }), "office", 0, [onWall, elsewhere, nowhere]);
        expect(targets.map((target) => target.id)).toEqual(["wall"]);
    });
});
