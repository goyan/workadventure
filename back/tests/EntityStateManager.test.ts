import type { WAMFileFormat } from "@workadventure/map-editor";
import type { SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { EntityStateManager } from "../src/Model/EntityStateManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

type SwitchOptions = { targets?: unknown; allowedTags?: string[] };

function wamWith(switchOptions: SwitchOptions = {}): WAMFileFormat {
    const prefabRef = { collectionName: "lamps", id: "x" };
    return {
        version: "2.1.0",
        mapUrl: "map.tmj",
        areas: [],
        entityCollections: [],
        entities: {
            switch: {
                x: 100,
                y: 100,
                prefabRef,
                properties: [
                    {
                        id: "p",
                        type: "switchPropertyData",
                        key: "on",
                        targets: switchOptions.targets ?? { mode: "zone" },
                        allowedTags: switchOptions.allowedTags,
                    },
                ],
            },
            plain: { x: 100, y: 100, prefabRef },
            l1: { x: 132, y: 100, prefabRef },
            l2: { x: 164, y: 100, prefabRef },
            l3: { x: 196, y: 100, prefabRef },
            far: { x: 100 + 1921, y: 100, prefabRef },
            upstairs: { x: 132, y: 100, elevation: 64, prefabRef },
        },
    } as unknown as WAMFileFormat;
}

function createHarness({
    wam = wamWith(),
    saved = {},
    failingStore = false,
}: { wam?: WAMFileFormat; saved?: Record<string, string>; failingStore?: boolean } = {}) {
    let time = 10_000;
    const sent: SubToPusherRoomMessage[] = [];
    const repository = {
        loadVariables: vi.fn(() => (failingStore ? Promise.reject(new Error("down")) : Promise.resolve(saved))),
        saveVariable: vi.fn(() => Promise.resolve(1)),
    } satisfies VariablesRepositoryInterface;
    const manager = new EntityStateManager(
        { getWam: () => wam, sendSubMessageToRoom: (message: SubToPusherRoomMessage) => void sent.push(message) },
        { repository, roomUrl: "room" },
        () => time,
    );
    const user = { uuid: "alice", tags: [] as string[] };
    const press = (entityIds: string[], value = "false", overrides: Record<string, unknown> = {}, by = user) =>
        manager.press(by, { switchId: "switch", entityIds, key: "on", value, ...overrides });
    return {
        manager,
        sent,
        repository,
        user,
        press,
        advance: (ms: number) => {
            time += ms;
        },
    };
}

describe("EntityStateManager", () => {
    it("reads a switch the map holds without targets as a room switch, instead of failing", () => {
        const wam = wamWith();
        // What a live edit command leaves in the map: nothing fills the defaults of the schema in.
        const raw = wam.entities.switch.properties?.[0] as unknown as Record<string, unknown>;
        delete raw.targets;
        delete raw.key;
        const { press } = createHarness({ wam });

        expect(press(["l1", "far"])).toEqual(["l1"]);
    });

    it("ignores the press of a switch that is not well formed", () => {
        const { manager, press } = createHarness({ wam: wamWith({ targets: { mode: "ids" } }) });

        expect(press(["l1"])).toEqual([]);
        expect(manager.getAll()).toEqual([]);
    });

    it("sets the state of the targets of a switch and tells the room", () => {
        const { manager, sent, press, repository } = createHarness();

        expect(press(["l1", "l2"])).toEqual(["l1", "l2"]);

        expect(manager.getAll()).toEqual([
            { entityId: "l1", key: "on", value: "false" },
            { entityId: "l2", key: "on", value: "false" },
        ]);
        expect(sent).toEqual([
            {
                message: {
                    $case: "entityStateMessage",
                    entityStateMessage: { entityId: "l1", key: "on", value: "false" },
                },
            },
            {
                message: {
                    $case: "entityStateMessage",
                    entityStateMessage: { entityId: "l2", key: "on", value: "false" },
                },
            },
        ]);
        expect(repository.saveVariable).toHaveBeenCalledWith("entity-states:room", "l1::on", "false");
    });

    it("keeps nothing for an object back to its default state", () => {
        const { manager, press, repository, advance } = createHarness();
        press(["l1"]);
        advance(1000);

        expect(press(["l1"], "true")).toEqual(["l1"]);

        expect(manager.getAll()).toEqual([]);
        expect(repository.saveVariable).toHaveBeenLastCalledWith("entity-states:room", "l1::on", "");
    });

    it("does nothing when the state is already the one asked", () => {
        const { sent, press } = createHarness();
        expect(press(["l1"], "true")).toEqual([]);
        expect(sent).toEqual([]);
    });

    it.each([
        ["an unknown switch", { switchId: "nope" }],
        ["an object that is not a switch", { switchId: "plain" }],
        ["an unknown key", { key: "open" }],
        ["an unknown value", { value: "1" }],
    ])("ignores a press with %s", (_label, overrides) => {
        const { manager, sent, press } = createHarness();
        expect(press(["l1"], "false", overrides)).toEqual([]);
        expect(manager.getAll()).toEqual([]);
        expect(sent).toEqual([]);
    });

    it("ignores a press on more targets than a switch may command", () => {
        const { press, manager } = createHarness();
        const ids = Array.from({ length: 201 }, () => "l1");
        expect(press(ids)).toEqual([]);
        expect(manager.getAll()).toEqual([]);
    });

    it("keeps a switch for the users with one of its tags", () => {
        const { manager, user } = createHarness({ wam: wamWith({ allowedTags: ["staff"] }) });
        const message = { switchId: "switch", entityIds: ["l1"], key: "on", value: "false" };

        expect(manager.press(user, message)).toEqual([]);
        expect(manager.press({ uuid: "bob", tags: ["staff"] }, message)).toEqual(["l1"]);
    });

    it("still switches the other targets when one of them is gone", () => {
        const { press } = createHarness();
        expect(press(["l1", "deleted", "l2"])).toEqual(["l1", "l2"]);
    });

    it("leaves out the targets the switch may not reach", () => {
        const { press } = createHarness();
        expect(press(["far", "upstairs", "l1"])).toEqual(["l1"]);
    });

    it("only reaches the listed targets of a switch wired by ids", () => {
        const { press } = createHarness({ wam: wamWith({ targets: { mode: "ids", ids: ["l2", "far"] } }) });
        expect(press(["l1", "l2", "far"])).toEqual(["l2", "far"]);
    });

    it("lets a user press 5 times a second at most", () => {
        const { manager, press, advance } = createHarness();
        const targets = ["l1", "l2", "l3", "far", "upstairs"];
        for (const [index, id] of targets.entries()) {
            press([id], index % 2 === 0 ? "false" : "true");
        }

        expect(press(["l1"], "true")).toEqual([]);
        // Somebody else is not held back by the presses of the first user.
        expect(
            manager.press(
                { uuid: "bob", tags: [] },
                { switchId: "switch", entityIds: ["l2"], key: "on", value: "false" },
            ),
        ).toEqual(["l2"]);

        advance(1000);
        expect(press(["l3"], "true")).toEqual(["l3"]);
    });

    it("changes the state of an object 3 times a second at most, whoever asks", () => {
        const { manager, press, advance } = createHarness();
        press(["l1"]);
        advance(333);

        expect(
            manager.press(
                { uuid: "bob", tags: [] },
                { switchId: "switch", entityIds: ["l1", "l2"], key: "on", value: "true" },
            ),
        ).toEqual([]);
        expect(manager.getAll()).toEqual([{ entityId: "l1", key: "on", value: "false" }]);

        advance(1);
        expect(press(["l1"], "true")).toEqual(["l1"]);
    });

    it("brings back the states saved before a restart", async () => {
        const { manager, sent } = createHarness({ saved: { "l1::on": "false", "l2::on": "" } });

        await manager.restore();

        expect(manager.getAll()).toEqual([{ entityId: "l1", key: "on", value: "false" }]);
        expect(sent).toEqual([]);
    });

    it("forgets the saved state of an object the map no longer has", async () => {
        const { manager, repository } = createHarness({ saved: { "deleted::on": "false" } });

        await manager.restore();

        expect(manager.getAll()).toEqual([]);
        expect(repository.saveVariable).toHaveBeenCalledWith("entity-states:room", "deleted::on", "");
    });

    it("ignores a saved key or value it does not know", async () => {
        const { manager } = createHarness({ saved: { "l1::open": "false", "l2::on": "dimmed", broken: "false" } });

        await manager.restore();

        expect(manager.getAll()).toEqual([]);
    });

    it("starts with every object on when the store does not answer", async () => {
        const { manager } = createHarness({ failingStore: true });
        const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

        await expect(manager.restore()).resolves.toBeUndefined();
        expect(manager.getAll()).toEqual([]);
        expect(logged).toHaveBeenCalledOnce();
        logged.mockRestore();
    });
});
