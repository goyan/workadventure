import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import { readVehicleState } from "@wa/front/Phaser/Vehicle/Vehicle";
import { Player } from "@wa/front/Phaser/Player/Player";
import { RemotePlayer } from "@wa/front/Phaser/Entity/RemotePlayer";
import { ActiveEventList, UserInputEvent } from "@wa/front/Phaser/UserInput/UserInputManager";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { userMovingStore } from "@wa/front/Stores/GameStore";
import { findSeatOfCharacter, findSeatUnderFeet } from "@wa/front/Phaser/Player/Seat";
import type { Seat } from "@wa/front/Phaser/Player/Seat";

vi.mock("@wa/front/Phaser/Player/Seat", () => ({
    findSeatUnderFeet: vi.fn(),
    findSeatOfCharacter: vi.fn(),
    isSeatTaken: () => false,
}));
vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

const seat: Seat = {
    id: "chair",
    entityId: "chair",
    feet: { x: 16, y: 16 },
    direction: PositionMessage_Direction.DOWN,
    depth: 0,
    trigger: "auto",
};

function fixture() {
    const player: Player = Object.create(Player.prototype);
    const slide = vi.fn();
    const show = vi.fn();
    const emit = vi.fn();
    Object.assign(player, {
        vehicleState: readVehicleState(null),
        x: 16,
        y: 0,
        _lastDirection: PositionMessage_Direction.DOWN,
        getBody: () => ({ height: 16, offset: { y: 8 }, setVelocity: vi.fn() }),
        stop: vi.fn(),
        snapToTileCenter: vi.fn(),
        getBodyBox: () => ({ left: 8, right: 24, top: 8, bottom: 24 }),
        updateSwimming: vi.fn(),
        updateCanoe: vi.fn(),
        updateObjectAction: vi.fn(),
        releaseSeatObjectWhenOut: vi.fn(),
        slideToSeat: slide,
        sitPrompt: { show, hide: vi.fn() },
        moveBy: vi.fn(),
        runSmokeTrail: { emit: vi.fn() },
        emit,
    });
    return { player, slide, show, emit };
}

function input(...events: UserInputEvent[]): ActiveEventList {
    const active = new ActiveEventList();
    for (const event of events) active.set(event, true);
    return active;
}

beforeEach(() => {
    followStateStore.set("off");
    userMovingStore.set(false);
    vi.mocked(findSeatUnderFeet).mockReturnValue(seat);
});
afterEach(() => {
    userMovingStore.set(false);
    followStateStore.set("off");
    vi.restoreAllMocks();
    vi.clearAllMocks();
});

describe("automatic seating only when stopping on a seat", () => {
    it.each([UserInputEvent.MoveUp, UserInputEvent.MoveDown, UserInputEvent.MoveLeft, UserInputEvent.MoveRight])(
        "keeps running over a seat in direction %s, including the first running frame",
        (direction) => {
            const { player, slide, emit } = fixture();
            player.moveUser(16, input(UserInputEvent.SpeedUp, direction));
            expect(slide).not.toHaveBeenCalled();
            expect(player.isRunning()).toBe(true);
            expect(emit).toHaveBeenCalledWith("hasMoved", expect.objectContaining({ moving: true, running: true }));
        },
    );

    it.each([UserInputEvent.MoveUp, UserInputEvent.MoveDown, UserInputEvent.MoveLeft, UserInputEvent.MoveRight])(
        "keeps walking over a seat in direction %s: only stopping on it sits down",
        (direction) => {
            const { player, slide, emit } = fixture();
            player.moveUser(16, input(direction));
            expect(slide).not.toHaveBeenCalled();
            expect(emit).toHaveBeenCalledWith("hasMoved", expect.objectContaining({ moving: true, running: false }));
        },
    );

    it.each([input(), input(UserInputEvent.SpeedUp)])("sits once stopped on a seat, even after running", (events) => {
        const { player, slide } = fixture();
        Object.assign(player, { lastRunning: true });
        player.moveUser(16, events);
        expect(slide).toHaveBeenCalledWith(seat);
    });

    it("keeps interaction-key seats available without sitting automatically", () => {
        const { player, slide, show } = fixture();
        vi.mocked(findSeatUnderFeet).mockReturnValue({ ...seat, trigger: "key" });
        player.moveUser(16, input(UserInputEvent.SpeedUp, UserInputEvent.MoveRight));
        expect(slide).not.toHaveBeenCalled();
        expect(show).toHaveBeenCalledWith(expect.any(Function));
    });

    it("does not interrupt an active double-click path to sit on a seat", () => {
        const { player, slide } = fixture();
        const advance = vi.fn();
        Object.assign(player, { pathToFollow: [seat.feet], followPath: advance });
        player.moveUser(16, input());
        expect(slide).not.toHaveBeenCalled();
        expect(advance).toHaveBeenCalledWith(16);
    });

    it("shows a remote runner standing and still recognizes its seated position after stopping", () => {
        const player: RemotePlayer = Object.create(RemotePlayer.prototype);
        const sit = vi.fn();
        const stand = vi.fn();
        Object.assign(player, {
            stopMoveTo: vi.fn(),
            standUp: stand,
            sit,
            playAnimation: vi.fn(),
            setPosition: vi.fn(),
            _lastDirection: seat.direction,
        });
        vi.mocked(findSeatOfCharacter).mockReturnValue(seat);
        const position = { x: 16, y: 0, direction: seat.direction, moving: true, running: true };
        player.updatePosition(position);
        expect(player.isRunning()).toBe(true);
        expect(sit).not.toHaveBeenCalled();
        expect(stand).toHaveBeenCalled();
        player.updatePosition({ ...position, moving: false, running: false });
        expect(player.isRunning()).toBe(false);
        expect(sit).toHaveBeenCalledWith(seat.direction);
    });
});

describe("sitting only within half a tile of a seat", () => {
    const beside: Seat = { ...seat, id: "beside", entityId: "beside", feet: { x: 48, y: 16 } };

    beforeEach(() => {
        // The feet are more than half a tile from any seat: none under them.
        vi.mocked(findSeatUnderFeet).mockReturnValue(undefined);
    });

    it("stays standing when stopping on the tile next to a seat", () => {
        const { player, slide } = fixture();
        player.moveUser(16, input());
        expect(slide).not.toHaveBeenCalled();
    });

    it("never goes back on the seat just left by stepping off it and stopping next to it", () => {
        const { player, slide } = fixture();
        Object.assign(player, { ignoredSeatId: beside.id, ignoredSeatEntityId: beside.entityId });
        player.moveUser(16, input(UserInputEvent.MoveRight));
        player.moveUser(16, input());
        expect(slide).not.toHaveBeenCalled();
    });
});
