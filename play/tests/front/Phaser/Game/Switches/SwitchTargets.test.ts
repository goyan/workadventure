import type { SwitchPropertyData } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";
import {
    entityStateKeysOf,
    resolveSwitchTargets,
    switchPressValue,
    switchPropertyOf,
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
const room = { x: 100, y: 100, width: 200, height: 200 };

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
        const candidates = [lamp("in", 150, 150), lamp("edge", 300, 300), lamp("out", 301, 150)];
        const targets = resolveSwitchTargets(property({ mode: "zone" }), room, 0, candidates);
        expect(targets.map((target) => target.id)).toEqual(["in", "edge"]);
    });

    it("only commands the objects of its own floor in zone mode", () => {
        const candidates = [lamp("ground", 150, 150), lamp("upstairs", 150, 150, 64)];
        expect(resolveSwitchTargets(property({ mode: "zone" }), room, 0, candidates).map((t) => t.id)).toEqual([
            "ground",
        ]);
        expect(resolveSwitchTargets(property({ mode: "zone" }), room, 64, candidates).map((t) => t.id)).toEqual([
            "upstairs",
        ]);
    });

    it("commands nothing in zone mode out of any room", () => {
        expect(resolveSwitchTargets(property({ mode: "zone" }), undefined, 0, [lamp("a", 150, 150)])).toEqual([]);
    });

    it("leaves out an object that has not the state the switch commands", () => {
        const plain: SwitchableTarget = { id: "plain", point: { x: 150, y: 150 }, elevation: 0, keys: [] };
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

describe("switchPropertyOf", () => {
    const entityWith = (...properties: unknown[]) => ({ getProperties: () => properties as never });

    it("reads the switch of an object, with its defaults", () => {
        expect(switchPropertyOf(entityWith({ id: "p", type: "switchPropertyData" }))?.targets).toEqual({
            mode: "zone",
        });
    });

    it("ignores a switch another editor sent incomplete: the game reads it at every image", () => {
        expect(
            switchPropertyOf(entityWith({ id: "p", type: "switchPropertyData", targets: { mode: "ids" } })),
        ).toBeUndefined();
    });
});
