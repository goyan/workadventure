import { Subject } from "rxjs";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    ICE_SHACK_CRACK_MS,
    ICE_SHACK_MM,
    ICE_SHACK_READY_MS,
    iceByte,
    iceShackEventOnWire,
} from "@workadventure/map-editor";
import type { IceShackEvent } from "@workadventure/map-editor";
import { IceShackAction, PositionMessage_Direction } from "@workadventure/messages";
import type { IceShackMessage, IceShacksMessage } from "@workadventure/messages";
import LL from "../../../../../src/i18n/i18n-svelte";
import { fishingCardsStore, rodEquippedStore } from "../../../../../src/front/Stores/FishingStore";
import { iceShackLightsStore } from "../../../../../src/front/Stores/IceShackStore";
import type { GameScene } from "../../../../../src/front/Phaser/Game/GameScene";

const ground = vi.hoisted(() => ({ server: true }));
const seat = vi.hoisted(() => ({ id: undefined as string | undefined }));
vi.mock("../../../../../src/front/Phaser/Game/Weather/GroundSource", () => ({
    followsServerGround: () => ground.server,
}));
vi.mock("../../../../../src/front/Phaser/Game/IceShack/IceShackView", () => ({
    IceShackView: class {
        update = vi.fn();
        destroy = vi.fn();
    },
}));
vi.mock("../../../../../src/front/Phaser/Player/Seat", () => ({
    findSeatOfCharacter: () => (seat.id ? { id: seat.id } : undefined),
}));
vi.mock("../../../../../src/front/Phaser/Game/Ice/FrozenWater", () => ({
    iceUnderfoot: () => "solid",
}));

const { IceShackManager, iceShackSeatId } =
    await import("../../../../../src/front/Phaser/Game/IceShack/IceShackManager");

const OWN_ID = 1;
/** The feet of an avatar are 8 px under its position. */
const FEET_DY = 8;

function harness(options: { iceMm?: number; depth?: number } = {}) {
    const stream = new Subject<IceShacksMessage>();
    const emitIceShackAction = vi.fn();
    const player = {
        x: 300,
        y: 200,
        playerName: "Me",
        seated: false,
        isSeated(): boolean {
            return this.seated;
        },
        standUp: vi.fn(function (this: { seated: boolean }) {
            this.seated = false;
        }),
        sitOnSeat: vi.fn(() => true),
        getFloorZ: () => 0,
        getPositionForFeet: (feet: { x: number; y: number }) => ({ x: feet.x, y: feet.y - FEET_DY }),
    };
    const ice = options.iceMm ?? 200;
    const scene = {
        connection: { iceShacksMessageStream: stream, emitIceShackAction, getUserId: () => OWN_ID },
        CurrentPlayer: player,
        MapPlayersByKey: new Map([[2, { playerName: "Bob" }]]),
        getMeadow: () => ({
            iceAtPoint: () => ice,
            iceByteAt: () => iceByte(ice),
        }),
        getTerrainWater: () => ({ settledDepthAt: () => options.depth ?? 40 }),
        getGameMap: () => ({ getWamFile: () => ({ getWam: () => ({ entities: {} }) }) }),
        getNightActive: () => false,
        markDirty: vi.fn(),
    };
    const manager = new IceShackManager(scene as unknown as GameScene, undefined, () => ({ x: 0, y: 0 }));
    const send = (shacks: Partial<IceShackMessage>[], events: [number, number, IceShackEvent][] = []): void =>
        stream.next({
            shacks: shacks.map((shack) => ({
                id: 1,
                x: 318,
                y: 200,
                ownerName: "Ana",
                ownerUserId: 2,
                occupantUserId: 0,
                ageMs: ICE_SHACK_READY_MS,
                crackingMs: 0,
                ...shack,
            })),
            events: events.map(([userId, shackId, type]) => ({ userId, shackId, type: iceShackEventOnWire(type) })),
        });
    const action = (testId: string) => manager.wheelActions().find((candidate) => candidate.testId === testId);
    return { manager, player, send, emitIceShackAction, action };
}

beforeEach(() => {
    ground.server = true;
    seat.id = undefined;
    rodEquippedStore.set(false);
    fishingCardsStore.set([]);
});
afterEach(() => {
    rodEquippedStore.set(false);
});

describe("the wheel on the ice", () => {
    it("offers to put a shack up on ice thick enough, and asks the server", () => {
        const { action, emitIceShackAction } = harness();
        const build = action("avatar-ice-shack-build");
        expect(build?.disabled).toBe(false);
        expect(build?.icon).toBe("iceShack");
        build?.callback();
        expect(emitIceShackAction).toHaveBeenCalledWith(IceShackAction.ICE_SHACK_BUILD);
    });

    it("greys it on ice too thin for a shack, telling why", () => {
        const { action } = harness({ iceMm: ICE_SHACK_MM - 20 });
        const build = action("avatar-ice-shack-build");
        expect(build?.disabled).toBe(true);
        expect(build?.detail).toBe(get(LL).actionbar.iceShack.thinIce());
    });

    it("never greys it on the ice the server would take, whatever the byte it is sent in", () => {
        const { action } = harness({ iceMm: ICE_SHACK_MM });
        expect(action("avatar-ice-shack-build")?.disabled).toBe(false);
    });

    it("greys it over a frozen puddle", () => {
        const { action } = harness({ depth: 8 });
        expect(action("avatar-ice-shack-build")?.detail).toBe(get(LL).actionbar.iceShack.shallow());
    });

    it("greys it for a player who follows a weather of their own: the shack goes on the ice of the map", () => {
        ground.server = false;
        const { action } = harness();
        expect(action("avatar-ice-shack-build")?.disabled).toBe(true);
        expect(action("avatar-ice-shack-build")?.detail).toBe(get(LL).actionbar.iceShack.personal());
    });

    it("offers nothing off the ice", () => {
        const { manager } = harness({ iceMm: 0 });
        expect(manager.wheelActions()).toEqual([]);
    });

    it("by a shack, offers to sit in it, greyed while somebody sits there", () => {
        const { action, send, player } = harness();
        send([{}]);
        const enter = action("avatar-ice-shack-enter");
        expect(enter?.actionName).toBe(get(LL).actionbar.iceShack.enterOf({ name: "Ana" }));
        expect(enter?.disabled).toBe(false);
        enter?.callback();
        expect(player.sitOnSeat).toHaveBeenCalledWith(iceShackSeatId(1));
        send([{ occupantUserId: 2 }]);
        expect(action("avatar-ice-shack-enter")?.detail).toBe(get(LL).actionbar.iceShack.occupiedBy({ name: "Bob" }));
        expect(action("avatar-ice-shack-dismantle")).toBeUndefined();
    });

    it("offers who put it up to take it down", () => {
        const { action, send, emitIceShackAction } = harness();
        send([{ ownerUserId: OWN_ID }]);
        action("avatar-ice-shack-dismantle")?.callback();
        expect(emitIceShackAction).toHaveBeenCalledWith(IceShackAction.ICE_SHACK_DISMANTLE, 1);
    });
});

describe("the stool of a shack", () => {
    it("is a seat of the map once the shack is up, its avatar facing the hole", () => {
        const { manager, send } = harness();
        send([{ ageMs: ICE_SHACK_READY_MS - 1 }]);
        expect(manager.seats()).toEqual([]);
        send([{}]);
        const [stool] = manager.seats();
        expect(stool.id).toBe(iceShackSeatId(1));
        // The avatar sits at (300, 200), the hole 18 px to its right.
        expect(stool.feet).toEqual({ x: 300, y: 200 + FEET_DY });
        expect(stool.direction).toBe(PositionMessage_Direction.RIGHT);
        expect(stool.trigger).toBe("key");
    });

    it("is no seat on an ice that cracks", () => {
        const { manager, send } = harness();
        send([{ crackingMs: ICE_SHACK_CRACK_MS }]);
        expect(manager.seats()).toEqual([]);
    });

    it("seated on it, the server is asked, the rod comes in hand, and the line goes down the hole", () => {
        const { manager, send, player, emitIceShackAction } = harness();
        send([{}]);
        player.seated = true;
        seat.id = iceShackSeatId(1);
        manager.update(0);
        expect(emitIceShackAction).toHaveBeenCalledWith(IceShackAction.ICE_SHACK_ENTER, 1);
        expect(manager.ownHole()).toBeUndefined();
        send([{ occupantUserId: OWN_ID }], [[OWN_ID, 1, "entered"]]);
        manager.update(16);
        expect(manager.ownHole()).toEqual({ x: 318, y: 200 });
        expect(get(rodEquippedStore)).toBe(true);
        expect(get(iceShackLightsStore)).toHaveLength(1);
    });

    it("refused by the server, the player gets up and is told why", () => {
        const { manager, send, player } = harness();
        send([{}]);
        player.seated = true;
        seat.id = iceShackSeatId(1);
        manager.update(0);
        send([{ occupantUserId: 2 }], [[OWN_ID, 1, "occupied"]]);
        expect(player.standUp).toHaveBeenCalled();
        expect(get(fishingCardsStore).at(-1)?.text).toBe(get(LL).actionbar.iceShack.occupied());
    });

    it("gets its angler out when the ice cracks under it", () => {
        const { manager, send, player } = harness();
        send([{ occupantUserId: OWN_ID }]);
        player.seated = true;
        seat.id = iceShackSeatId(1);
        manager.update(0);
        send([{ crackingMs: ICE_SHACK_CRACK_MS }], [[OWN_ID, 1, "cracking"]]);
        expect(player.standUp).toHaveBeenCalled();
        expect(get(fishingCardsStore).at(-1)?.text).toBe(get(LL).actionbar.iceShack.cracking());
    });

    it("who put a shack up sits in it once it is up", () => {
        const { manager, send, player } = harness();
        send([{ ownerUserId: OWN_ID, occupantUserId: OWN_ID, ageMs: 0 }], [[OWN_ID, 1, "built"]]);
        manager.update(0);
        expect(player.sitOnSeat).not.toHaveBeenCalled();
        send([{ ownerUserId: OWN_ID, occupantUserId: OWN_ID }]);
        manager.update(16);
        expect(player.sitOnSeat).toHaveBeenCalledWith(iceShackSeatId(1));
    });

    it("tells the server when its angler walked off", () => {
        const { manager, send, player, emitIceShackAction } = harness();
        send([{ occupantUserId: OWN_ID }]);
        player.seated = true;
        seat.id = iceShackSeatId(1);
        manager.update(0);
        player.seated = false;
        seat.id = undefined;
        player.x = 400;
        manager.update(16);
        expect(emitIceShackAction).toHaveBeenCalledWith(IceShackAction.ICE_SHACK_LEAVE, 1);
    });
});
