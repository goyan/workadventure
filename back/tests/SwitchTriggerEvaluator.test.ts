import type { WAMFileFormat } from "@workadventure/map-editor";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWITCH_TRIGGER_TICK_MS, SwitchTriggerEvaluator } from "../src/Model/SwitchTriggerEvaluator";

const prefabRef = { collectionName: "lamps", id: "x" };
const room = { id: "room", name: "Room", x: 0, y: 0, width: 320, height: 320, visible: true, properties: [] };

type Trigger = Record<string, unknown>;
const sensor = (id: string, trigger: Trigger, ids: string[], at = { x: 160, y: 160 }, elevation?: number) => ({
    [id]: {
        ...at,
        elevation,
        prefabRef,
        properties: [{ id: `${id}-p`, type: "switchPropertyData", key: "on", targets: { mode: "ids", ids }, trigger }],
    },
});
const lamps = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { x: 100, y: 100, prefabRef }]));
const inRoom = { type: "presence", scope: "room", areaId: "room", tiles: 3, offDelay: 30 };

function createHarness(entities: Record<string, unknown>, areas: unknown[] = [room], settings?: unknown) {
    // Thursday 2026-01-15, 12:00 in Paris.
    let time = new Date("2026-01-15T11:00:00Z").getTime();
    const wam = { lastCommandId: "1", entities, areas, settings } as unknown as WAMFileFormat;
    const users = new Map<number, { getPosition: () => { x: number; y: number }; getFloorZ: () => number }>();
    const written: [string, string][] = [];
    let refuse = false;
    const getUsers = vi.fn(() => users);
    const setAutomatic = vi.fn((entityId: string, _key: string, value: string) => {
        if (refuse) return "refused" as const;
        written.push([entityId, value]);
        return "set" as const;
    });
    const evaluator = new SwitchTriggerEvaluator(
        { getWam: () => wam, getUsers: getUsers as never },
        { setAutomatic },
        () => time,
    );
    return {
        evaluator,
        wam,
        written,
        getUsers,
        enter: (id: number, x = 100, y = 100, floorZ = 0) =>
            users.set(id, { getPosition: () => ({ x, y }), getFloorZ: () => floorZ }),
        leave: (id: number) => users.delete(id),
        advance: (seconds: number) => {
            time += seconds * 1000;
        },
        refuse: (value: boolean) => {
            refuse = value;
        },
        /** What was written since the last call. */
        tick: () => {
            written.length = 0;
            evaluator.tick();
            return [...written];
        },
    };
}

describe("SwitchTriggerEvaluator, presence in a room", () => {
    it("puts out the lamps of an empty room at its first look, and lights them when somebody comes in", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1", "l2"]), ...lamps("l1", "l2") });

        expect(h.tick()).toEqual([
            ["l1", "false"],
            ["l2", "false"],
        ]);
        h.enter(1);
        h.advance(1);
        expect(h.tick()).toEqual([
            ["l1", "true"],
            ["l2", "true"],
        ]);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });

    it("puts the lamps out 30 s after the last person left, not before", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.enter(1);
        h.tick();
        h.leave(1);

        h.advance(29);
        expect(h.tick()).toEqual([]);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("puts the lamps out at the next look with a delay of 0", () => {
        const h = createHarness({ ...sensor("s", { ...inRoom, offDelay: 0 }, ["l1"]), ...lamps("l1") });
        h.enter(1);
        h.tick();
        h.leave(1);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("does not blink when somebody steps out and back in within the delay", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.enter(1);
        h.tick();
        for (let round = 0; round < 3; round++) {
            h.leave(1);
            h.advance(5);
            expect(h.tick()).toEqual([]);
            h.enter(1);
            h.advance(1);
            expect(h.tick()).toEqual([]);
        }
    });

    it("does not sense somebody on another floor of the map", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.tick();
        h.enter(1, 100, 100, 64);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });

    it("senses nothing, without failing, when its area is gone", () => {
        const h = createHarness({ ...sensor("s", { ...inRoom, areaId: "deleted" }, ["l1"]), ...lamps("l1") });
        h.enter(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });
});

describe("SwitchTriggerEvaluator, proximity", () => {
    const near = { type: "presence", scope: "proximity", tiles: 3, offDelay: 0 };

    it("senses somebody within its tiles, from the middle of its first tile", () => {
        // The sensor is at (160, 160): its middle is taken at (176, 176).
        const h = createHarness({ ...sensor("s", near, ["l1"]), ...lamps("l1") }, []);
        h.tick();
        h.enter(1, 176 + 96, 176);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
        h.enter(1, 176 + 97, 176);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("only senses its own floor", () => {
        const h = createHarness({ ...sensor("s", near, ["l1"], { x: 160, y: 160 }, 64), ...lamps("l1") }, []);
        h.tick();
        h.enter(1, 176, 176, 0);
        h.advance(1);
        expect(h.tick()).toEqual([]);
        h.enter(1, 176, 176, 64);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
    });
});

describe("SwitchTriggerEvaluator, cone", () => {
    // Pointing downwards, 90 degrees wide, 3 tiles long, from the middle of the sensor at (176, 176).
    const cone = { type: "presence", scope: "cone", tiles: 3, offDelay: 0, direction: 90, angle: 90 };

    it("senses somebody in front of it, not behind nor too far", () => {
        const h = createHarness({ ...sensor("s", cone, ["l1"]), ...lamps("l1") }, []);
        h.tick();
        h.enter(1, 176, 176 + 96);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
        h.enter(1, 176, 176 - 40);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
        h.enter(1, 176, 176 + 97);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });

    it("only senses its own floor", () => {
        const h = createHarness({ ...sensor("s", cone, ["l1"]), ...lamps("l1") }, []);
        h.tick();
        h.enter(1, 176, 200, 64);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });
});

describe("SwitchTriggerEvaluator, hours", () => {
    it("lights during its hours, in the time of Paris", () => {
        const h = createHarness({
            ...sensor("t", { type: "hours", from: "12:30", to: "13:00" }, ["l1"]),
            ...lamps("l1"),
        });
        expect(h.tick()).toEqual([["l1", "false"]]);
        h.advance(30 * 60);
        expect(h.tick()).toEqual([["l1", "true"]]);
        h.advance(30 * 60);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });
});

describe("SwitchTriggerEvaluator, several triggers and manual presses", () => {
    it("keeps a lamp on while one of its triggers holds", () => {
        const h = createHarness({
            ...sensor("s", { ...inRoom, offDelay: 0 }, ["l1"]),
            ...sensor("t", { type: "hours", from: "12:30", to: "13:00" }, ["l1"]),
            ...lamps("l1"),
        });
        h.enter(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
        // The hours start while somebody is there, then the person leaves: the timer still holds the lamp.
        h.advance(30 * 60);
        expect(h.tick()).toEqual([]);
        h.leave(1);
        h.advance(1);
        expect(h.tick()).toEqual([]);
        // The hours end with nobody there: both let go.
        h.advance(30 * 60);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("leaves a manual press alone until what the triggers ask changes", () => {
        const h = createHarness({ ...sensor("s", { ...inRoom, offDelay: 0 }, ["l1"]), ...lamps("l1") });
        h.enter(1);
        h.tick();
        // Somebody puts the lamp out by hand (the evaluator is not told): it must not light it again.
        h.advance(5);
        expect(h.tick()).toEqual([]);
        // The room empties, then somebody comes back: the sensor has the say again.
        h.leave(1);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
        h.enter(1);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
    });

    it("asks again at the next look when a change was refused", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.tick();
        h.enter(1);
        h.refuse(true);
        h.advance(1);
        expect(h.tick()).toEqual([]);
        h.refuse(false);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
    });

    it("no longer writes the lamps of a sensor that was deleted", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.enter(1);
        h.tick();
        delete (h.wam.entities as Record<string, unknown>).s;
        (h.wam as { lastCommandId: string }).lastCommandId = "2";
        h.leave(1);
        h.advance(60);
        expect(h.tick()).toEqual([]);
    });

    it("costs nothing on a map without trigger: the players are not even read", () => {
        const manual = {
            sw: {
                x: 0,
                y: 0,
                prefabRef,
                properties: [{ id: "p", type: "switchPropertyData", key: "on", targets: { mode: "ids", ids: ["l1"] } }],
            },
        };
        const h = createHarness({ ...manual, ...lamps("l1") });
        h.enter(1);
        expect(h.tick()).toEqual([]);
        expect(h.getUsers).not.toHaveBeenCalled();
    });
});

describe("SwitchTriggerEvaluator, wandering animals the browsers report", () => {
    const quick = { ...inRoom, offDelay: 0 };

    it("lights for an animal a browser reports in the sensor, as for a player", () => {
        const h = createHarness({ ...sensor("s", quick, ["l1"]), ...lamps("l1") });
        h.tick();
        h.evaluator.reportAnimals("alice", ["s"]);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "true"]]);
    });

    it("lets go once no browser has reported the animal for 5 s", () => {
        const h = createHarness({ ...sensor("s", quick, ["l1"]), ...lamps("l1") });
        h.evaluator.reportAnimals("alice", ["s"]);
        h.tick();
        h.advance(4);
        expect(h.tick()).toEqual([]);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("lets go at once when the browser reports that the animal left", () => {
        const h = createHarness({ ...sensor("s", quick, ["l1"]), ...lamps("l1") });
        h.evaluator.reportAnimals("alice", ["s"]);
        h.tick();
        h.evaluator.reportAnimals("alice", []);
        h.advance(1);
        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("keeps the sensor lit while another browser still reports an animal", () => {
        const h = createHarness({ ...sensor("s", quick, ["l1"]), ...lamps("l1") });
        h.evaluator.reportAnimals("alice", ["s"]);
        h.evaluator.reportAnimals("bob", ["s"]);
        h.tick();
        h.evaluator.reportAnimals("alice", []);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });

    it("ignores a report about a timer, a manual switch or an unknown object", () => {
        const h = createHarness({
            ...sensor("t", { type: "hours", from: "20:00", to: "21:00" }, ["l1"]),
            ...lamps("l1"),
        });
        h.tick();
        h.evaluator.reportAnimals("alice", ["t", "l1", "nope"]);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });

    it("reads at most 50 sensors of a report", () => {
        const h = createHarness({ ...sensor("s", quick, ["l1"]), ...lamps("l1") });
        h.tick();
        h.evaluator.reportAnimals("alice", [...Array.from({ length: 50 }, (_, index) => `x${index}`), "s"]);
        h.advance(1);
        expect(h.tick()).toEqual([]);
    });
});

describe("SwitchTriggerEvaluator, a map edited with a switch that is not well formed", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("ignores a timer without hours instead of failing at every look", () => {
        const h = createHarness({ ...sensor("s", { type: "hours" }, ["l1"]), ...lamps("l1") });

        expect(h.tick()).toEqual([]);
    });

    it("ignores a sensor whose property has no targets", () => {
        const h = createHarness({
            s: { x: 160, y: 160, prefabRef, properties: [{ id: "p", type: "switchPropertyData", trigger: inRoom }] },
            ...lamps("l1"),
        });
        h.enter(1);

        expect(h.tick()).toEqual([]);
    });

    it("reads a sensor sent without its settings with their defaults", () => {
        const h = createHarness({
            ...sensor("s", { type: "presence", scope: "proximity" }, ["l1"]),
            ...lamps("l1"),
        });
        // 3 tiles around the middle of the sensor by default.
        h.enter(1, 176 + 100, 176);
        expect(h.tick()).toEqual([["l1", "false"]]);
        h.enter(1, 176 + 90, 176);
        h.advance(1);

        expect(h.tick()).toEqual([["l1", "true"]]);
    });

    it("looks 5 times a second: a lamp lights before a walking avatar has passed it", () => {
        vi.useFakeTimers();
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        const tick = vi.spyOn(h.evaluator, "tick");
        h.evaluator.start();

        vi.advanceTimersByTime(1000);

        h.evaluator.stop();
        expect(SWITCH_TRIGGER_TICK_MS).toBe(200);
        expect(tick).toHaveBeenCalledTimes(5);
    });

    it("keeps looking after a look that failed, without letting the error out of its timer", () => {
        vi.useFakeTimers();
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        const tick = vi.spyOn(h.evaluator, "tick").mockImplementationOnce(() => {
            throw new Error("unexpected");
        });
        h.evaluator.start();

        expect(() => vi.advanceTimersByTime(2 * SWITCH_TRIGGER_TICK_MS)).not.toThrow();

        h.evaluator.stop();
        expect(tick).toHaveBeenCalledTimes(2);
        expect(logged).toHaveBeenCalledTimes(1);
    });
});

describe("SwitchTriggerEvaluator, somebody in the building whose browser stopped reporting (tab in the background)", () => {
    const inBuilding = { type: "presence", scope: "building", tiles: 3, offDelay: 30 };
    const lit = () => {
        const h = createHarness({ ...sensor("s", inBuilding, ["l1"]), ...lamps("l1") });
        h.enter(1, 100, 100);
        h.evaluator.reportAnimals("1", ["s"]);
        expect(h.tick()).toEqual([["l1", "true"]]);
        return h;
    };

    it("keeps the sensor of the building lit while that player is still there and has not moved", () => {
        const h = lit();

        h.advance(600);

        expect(h.tick()).toEqual([]);
    });

    it("lets go, after the delay, once that player moved without a new report", () => {
        const h = lit();
        h.advance(600);
        h.tick();

        h.enter(1, 500, 500);
        h.advance(31);

        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("lets go, after the delay, once that player left the room", () => {
        const h = lit();
        h.advance(600);
        h.tick();

        h.leave(1);
        h.advance(31);

        expect(h.tick()).toEqual([["l1", "false"]]);
    });

    it("does not hold a sensor of another kind that way: an animal moves on its own", () => {
        const h = createHarness({ ...sensor("s", inRoom, ["l1"]), ...lamps("l1") });
        h.enter(1, 2000, 2000);
        h.evaluator.reportAnimals("1", ["s"]);
        expect(h.tick()).toEqual([["l1", "true"]]);

        h.advance(600);

        expect(h.tick()).toEqual([["l1", "false"]]);
    });
});

describe("SwitchTriggerEvaluator, hours on a map that has a place", () => {
    const sydney = {
        weatherLocation: { name: "Sydney", latitude: -33.87, longitude: 151.21, timezone: "Australia/Sydney" },
    };
    const evening = { type: "hours", from: "20:00", to: "23:00" };

    it("reads its hours in the time of the place: it is 22:00 in Sydney when it is noon in Paris", () => {
        const h = createHarness({ ...sensor("t", evening, ["l1"]), ...lamps("l1") }, [room], sydney);

        expect(h.tick()).toEqual([["l1", "true"]]);
    });

    it("reads them in the time of Paris on a map without a place, or whose place has no time zone", () => {
        const none = createHarness({ ...sensor("t", evening, ["l1"]), ...lamps("l1") });
        const { timezone: _timezone, ...before } = sydney.weatherLocation;
        const chosenBefore = createHarness({ ...sensor("t", evening, ["l1"]), ...lamps("l1") }, [room], {
            weatherLocation: before,
        });

        expect(none.tick()).toEqual([["l1", "false"]]);
        expect(chosenBefore.tick()).toEqual([["l1", "false"]]);
    });
});
