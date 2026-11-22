import {
    ICE_SHACK_CRACK_MS,
    ICE_SHACK_MM,
    ICE_SHACK_OWNER_AWAY_MS,
    ICE_SHACK_READY_MS,
    iceShackEventOfWire,
} from "@workadventure/map-editor";
import type { IceShackGround } from "@workadventure/map-editor";
import { IceShackAction } from "@workadventure/messages";
import type { IceShacksMessage, SubToPusherRoomMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { IceShackManager } from "../src/Model/IceShackManager";
import type { IceShackPlayer } from "../src/Model/IceShackManager";
import type { VariablesRepositoryInterface } from "../src/Services/Repository/VariablesRepositoryInterface";

const repositoryOf = (saved: Record<string, string>) =>
    ({
        loadVariables: vi.fn((_key: string) => Promise.resolve(saved)),
        saveVariable: vi.fn((_key: string, field: string, value: string) => {
            saved[field] = value;
            return Promise.resolve(1);
        }),
    }) satisfies VariablesRepositoryInterface;

/** A frozen lake over the whole map, its ice `ice.mm` thick, 40 px of water under it. */
function harness(options: { saved?: Record<string, string>; pool?: boolean; depth?: number } = {}) {
    const ice = { mm: 200, known: true };
    const clock = { now: 1_000_000 };
    const sent: IceShacksMessage[] = [];
    const players = new Map<number, IceShackPlayer>();
    const ground: IceShackGround = {
        iceMmAt: () => ice.mm,
        depthPxAt: () => options.depth ?? 40,
        inPool: () => options.pool === true,
    };
    const saved = options.saved ?? {};
    const repository = repositoryOf(saved);
    const room = {
        sendSubMessageToRoom: (message: SubToPusherRoomMessage) => {
            if (message.message?.$case === "iceShacksMessage") sent.push(message.message.iceShacksMessage);
        },
    };
    const objects: { x: number; y: number }[] = [];
    const manager = new IceShackManager(
        room,
        () => (ice.known ? ground : undefined),
        () => players,
        () => objects,
        { repository, roomUrl: "room" },
        () => clock.now,
    );
    const join = (id: number, key: string, x: number, y: number, floorZ = 0): IceShackPlayer => {
        const player = { id, key, name: key.toUpperCase(), x, y, floorZ };
        players.set(id, player);
        return player;
    };
    const last = (): IceShacksMessage => {
        const message = sent.at(-1);
        if (!message) throw new Error("nothing sent");
        return message;
    };
    const events = (): string[] => last().events.map((event) => iceShackEventOfWire(event.type));
    return { manager, ice, clock, sent, players, join, last, events, saved, repository, objects };
}

describe("putting a shack up", () => {
    it("drills a hole beside the player on the ice of the server and tells the room, the builder in it", () => {
        const { manager, join, last, events } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["built"]);
        expect(last().shacks).toHaveLength(1);
        expect(last().shacks[0]).toMatchObject({ x: 318, y: 200, ownerName: "ANA", ownerUserId: 1, occupantUserId: 1 });
        expect(last().shacks[0].ageMs).toBe(0);
    });

    it("is refused on ice too thin for it, telling only why", () => {
        const { manager, join, ice, last, events } = harness();
        ice.mm = ICE_SHACK_MM - 1;
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["thinIce"]);
        expect(last().events[0].userId).toBe(1);
        expect(last().shacks).toHaveLength(0);
    });

    it("is refused over a frozen puddle and on a pool", () => {
        const shallow = harness({ depth: 8 });
        shallow.join(1, "ana", 300, 200);
        shallow.manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(shallow.events()).toEqual(["shallow"]);
        const pool = harness({ pool: true });
        pool.join(1, "ana", 300, 200);
        pool.manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(pool.events()).toEqual(["pool"]);
    });

    it("is refused from a raised floor: the ice is on the ground", () => {
        const { manager, join, events } = harness();
        join(1, "ana", 300, 200, 20);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["notOnGround"]);
    });

    it("one a player, even far from the first", () => {
        const { manager, join, events, last } = harness();
        const ana = join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        ana.x = 2000;
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["onePerPlayer"]);
        expect(last().shacks).toHaveLength(1);
    });

    it("not too close to another one, nor on an object of the map", () => {
        const { manager, join, events, objects } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        join(2, "bob", 340, 200);
        manager.act(2, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["tooClose"]);
        objects.push({ x: 1018, y: 200 });
        join(3, "cid", 1000, 200);
        manager.act(3, IceShackAction.ICE_SHACK_BUILD, 0);
        expect(events()).toEqual(["object"]);
    });
});

describe("a shack of the room", () => {
    it("is told to a player who joins, and to a second player in the room", () => {
        const { manager, join, sent } = harness();
        join(1, "ana", 300, 200);
        expect(manager.snapshot()).toBeUndefined();
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        // Sent to the whole room: the second player gets the same message.
        expect(sent).toHaveLength(1);
        const joined = manager.snapshot();
        expect(joined?.shacks).toHaveLength(1);
        expect(joined?.events).toEqual([]);
    });

    it("seats one player at a time", () => {
        const { manager, join, clock, events, last } = harness();
        const ana = join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const id = last().shacks[0].id;
        clock.now += ICE_SHACK_READY_MS;
        join(2, "bob", 300, 230);
        manager.act(2, IceShackAction.ICE_SHACK_ENTER, id);
        expect(events()).toEqual(["occupied"]);
        // Ana gets up and walks off: Bob may sit.
        manager.act(1, IceShackAction.ICE_SHACK_LEAVE, id);
        expect(last().shacks[0].occupantUserId).toBe(0);
        ana.x = 600;
        manager.act(2, IceShackAction.ICE_SHACK_ENTER, id);
        expect(events()).toEqual(["entered"]);
        expect(last().shacks[0].occupantUserId).toBe(2);
    });

    it("is entered once it is up, and from near its stool only", () => {
        const { manager, join, clock, events, last } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        manager.act(1, IceShackAction.ICE_SHACK_LEAVE, last().shacks[0].id);
        const id = last().shacks[0].id;
        join(2, "bob", 300, 210);
        manager.act(2, IceShackAction.ICE_SHACK_ENTER, id);
        expect(events()).toEqual(["notReady"]);
        clock.now += ICE_SHACK_READY_MS;
        join(3, "cid", 900, 900);
        manager.act(3, IceShackAction.ICE_SHACK_ENTER, id);
        expect(events()).toEqual(["tooFar"]);
    });

    it("is left by a player who walked away from its stool, or who left the room", () => {
        const { manager, join, clock, last } = harness();
        const ana = join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        clock.now += ICE_SHACK_READY_MS;
        ana.x = 330;
        manager.step();
        expect(last().shacks[0].occupantUserId).toBe(0);
        ana.x = 300;
        manager.act(1, IceShackAction.ICE_SHACK_ENTER, last().shacks[0].id);
        expect(last().shacks[0].occupantUserId).toBe(1);
        manager.userLeft(1);
        expect(last().shacks[0].occupantUserId).toBe(0);
        expect(last().shacks[0].ownerUserId).toBe(0);
    });

    it("is taken down by who put it up only", () => {
        const { manager, join, events, last } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const id = last().shacks[0].id;
        join(2, "bob", 300, 210);
        manager.act(2, IceShackAction.ICE_SHACK_DISMANTLE, id);
        expect(events()).toEqual(["notOwner"]);
        expect(last().shacks).toHaveLength(1);
        manager.act(1, IceShackAction.ICE_SHACK_DISMANTLE, id);
        expect(events()).toEqual(["dismantled"]);
        expect(last().shacks).toHaveLength(0);
    });

    it("knows who put it up again when they come back with another id", () => {
        const { manager, join, players, events, last } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const id = last().shacks[0].id;
        manager.userLeft(1);
        players.delete(1);
        join(7, "ana", 300, 210);
        manager.step();
        expect(last().shacks[0].ownerUserId).toBe(7);
        manager.act(7, IceShackAction.ICE_SHACK_DISMANTLE, id);
        expect(events()).toEqual(["dismantled"]);
    });
});

describe("the thaw", () => {
    it("cracks a shack whose ice thawed too thin, gets its angler out, then takes it down", () => {
        const { manager, join, clock, ice, events, last } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        clock.now += ICE_SHACK_READY_MS;
        ice.mm = ICE_SHACK_MM - 10;
        manager.step();
        expect(events()).toEqual(["cracking"]);
        expect(last().shacks[0].occupantUserId).toBe(0);
        expect(last().shacks[0].crackingMs).toBe(ICE_SHACK_CRACK_MS);
        // Nobody may sit in it while it cracks.
        manager.act(1, IceShackAction.ICE_SHACK_ENTER, last().shacks[0].id);
        expect(events()).toEqual(["thinIce"]);
        clock.now += ICE_SHACK_CRACK_MS;
        manager.step();
        expect(events()).toEqual(["collapsed"]);
        expect(last().shacks).toHaveLength(0);
    });

    it("takes a shack down at once when its ice melted away", () => {
        const { manager, join, ice, events, last } = harness();
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        ice.mm = 0;
        manager.step();
        expect(events()).toEqual(["collapsed"]);
        expect(last().shacks).toHaveLength(0);
    });

    it("judges no ice while the room lives the time it missed", () => {
        const { manager, join, ice, sent } = harness();
        const catchingUp = { now: true };
        manager.catchUpWith(() => catchingUp.now);
        join(1, "ana", 300, 200);
        manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        ice.mm = 0;
        const before = sent.length;
        manager.step();
        expect(sent.length).toBe(before);
        catchingUp.now = false;
        manager.step();
        expect(sent.at(-1)?.shacks).toHaveLength(0);
    });
});

describe("kept through a restart", () => {
    it("brings its shacks back, without anyone in them", async () => {
        const first = harness();
        first.join(1, "ana", 300, 200);
        first.manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const again = harness({ saved: first.saved });
        await again.manager.restore();
        const joined = again.manager.snapshot();
        expect(joined?.shacks).toHaveLength(1);
        expect(joined?.shacks[0]).toMatchObject({ x: 318, y: 200, ownerName: "ANA", occupantUserId: 0 });
    });

    it("keeps its shacks while the map is not read yet, then judges their ice", async () => {
        const first = harness();
        first.join(1, "ana", 300, 200);
        first.manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const again = harness({ saved: first.saved });
        again.ice.known = false;
        await again.manager.restore();
        again.manager.step();
        again.manager.step();
        expect(again.manager.snapshot()?.shacks).toHaveLength(1);
        expect(again.repository.saveVariable).not.toHaveBeenCalled();
        again.ice.known = true;
        again.ice.mm = 0;
        again.manager.step();
        expect(again.events()).toEqual(["collapsed"]);
    });

    it("takes a shack down when who put it up stayed away a day", async () => {
        const first = harness();
        first.join(1, "ana", 300, 200);
        first.manager.act(1, IceShackAction.ICE_SHACK_BUILD, 0);
        const again = harness({ saved: first.saved });
        again.clock.now = first.clock.now + ICE_SHACK_OWNER_AWAY_MS;
        await again.manager.restore();
        again.manager.step();
        expect(again.events()).toEqual(["abandoned"]);
        expect(again.last().shacks).toHaveLength(0);
    });

    it("keeps a room open when its store does not answer", async () => {
        const { manager, repository } = harness();
        repository.loadVariables.mockRejectedValueOnce(new Error("down"));
        await expect(manager.restore()).resolves.toBeUndefined();
    });
});
