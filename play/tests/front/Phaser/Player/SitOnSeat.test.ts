import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PositionMessage_Direction } from "@workadventure/messages";
import { Player } from "@wa/front/Phaser/Player/Player";
import { ActiveEventList } from "@wa/front/Phaser/UserInput/UserInputManager";
import { VehicleMode } from "@wa/front/Phaser/Vehicle/Vehicle";
import { followStateStore } from "@wa/front/Stores/FollowStore";
import { userMovingStore } from "@wa/front/Stores/GameStore";
import { findSeatOfCharacter, findSeatUnderFeet, getSeats, isSeatTaken } from "@wa/front/Phaser/Player/Seat";
import type { Seat } from "@wa/front/Phaser/Player/Seat";

vi.mock("@wa/front/Phaser/Player/Seat", () => ({
    findSeatUnderFeet: vi.fn(),
    findSeatOfCharacter: vi.fn(),
    getSeats: vi.fn(),
    isSeatTaken: vi.fn(),
}));
vi.mock("@wa/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));

const seat: Seat = {
    id: "couch:1",
    entityId: "couch",
    feet: { x: 16, y: 16 },
    direction: PositionMessage_Direction.DOWN,
    depth: 0,
    trigger: "auto",
};

/** A player whose feet are at (16, 16), right on the seat. */
function fixture() {
    const player: Player = Object.create(Player.prototype);
    const slide = vi.fn();
    const standUp = vi.fn();
    const equipVehicle = vi.fn();
    const hidePrompt = vi.fn();
    Object.assign(player, {
        x: 16,
        y: 0,
        _lastDirection: PositionMessage_Direction.DOWN,
        swimming: false,
        vehicleState: { mode: VehicleMode.Off },
        getBody: () => ({ height: 16, offset: { y: 8 } }),
        getBodyBox: () => ({ left: 8, right: 24, top: 8, bottom: 24 }),
        isSeated: () => false,
        isInWater: () => false,
        standUp,
        equipVehicle,
        updateSwimming: vi.fn(),
        updateObjectAction: vi.fn(),
        releaseSeatObjectWhenOut: vi.fn(),
        slideToSeat: slide,
        sitPrompt: { show: vi.fn(), hide: hidePrompt },
        moveBy: vi.fn(),
        runSmokeTrail: { emit: vi.fn() },
        emit: vi.fn(),
        scene: { getGameMapFrontWrapper: () => ({ getTileDimensions: () => ({ width: 32, height: 32 }) }) },
    });
    return { player, slide, standUp, equipVehicle, hidePrompt };
}

beforeEach(() => {
    followStateStore.set("off");
    userMovingStore.set(false);
    vi.mocked(getSeats).mockReturnValue([seat]);
    vi.mocked(isSeatTaken).mockReturnValue(false);
    vi.mocked(findSeatUnderFeet).mockReturnValue(seat);
    vi.mocked(findSeatOfCharacter).mockReturnValue(undefined);
});
afterEach(() => {
    followStateStore.set("off");
    vi.clearAllMocks();
});

describe("sitting on the seat a double-click aimed at", () => {
    it("slides onto the seat, even the one just left or another place of the same couch", () => {
        const { player, slide } = fixture();
        Object.assign(player, { ignoredSeatId: seat.id, ignoredSeatEntityId: seat.entityId });

        expect(player.sitOnSeat(seat.id)).toBe(true);

        expect(slide).toHaveBeenCalledWith(seat);
    });

    it("sits on an interaction-key seat at once: the double-click asked for it", () => {
        const { player, slide } = fixture();
        vi.mocked(getSeats).mockReturnValue([{ ...seat, trigger: "key" }]);

        expect(player.sitOnSeat(seat.id)).toBe(true);

        expect(slide).toHaveBeenCalledWith(expect.objectContaining({ id: seat.id, trigger: "key" }));
    });

    it("gets off a vehicle to sit", () => {
        const { player, slide, equipVehicle } = fixture();
        Object.assign(player, { vehicleState: { mode: VehicleMode.Always } });

        expect(player.sitOnSeat(seat.id)).toBe(true);

        expect(equipVehicle).toHaveBeenCalledWith(VehicleMode.Off);
        expect(slide).toHaveBeenCalledWith(seat);
    });

    it("stays seated on the seat it already sits on", () => {
        const { player, slide, standUp } = fixture();
        Object.assign(player, { isSeated: () => true });
        vi.mocked(findSeatOfCharacter).mockReturnValue(seat);

        expect(player.sitOnSeat(seat.id)).toBe(true);

        expect(slide).not.toHaveBeenCalled();
        expect(standUp).not.toHaveBeenCalled();
    });

    it("does not sit on a seat taken meanwhile, gone from the map, or out of reach", () => {
        const { player, slide } = fixture();

        vi.mocked(isSeatTaken).mockReturnValueOnce(true);
        expect(player.sitOnSeat(seat.id)).toBe(false);

        vi.mocked(getSeats).mockReturnValueOnce([]);
        expect(player.sitOnSeat(seat.id)).toBe(false);

        // Feet at (16, 116): 100 px away, the run stopped far from the seat.
        Object.assign(player, { y: 100 });
        expect(player.sitOnSeat(seat.id)).toBe(false);

        expect(slide).not.toHaveBeenCalled();
    });

    it("does not sit while following someone or swimming", () => {
        const { player, slide } = fixture();

        followStateStore.set("active");
        expect(player.sitOnSeat(seat.id)).toBe(false);
        followStateStore.set("off");

        Object.assign(player, { swimming: true });
        expect(player.sitOnSeat(seat.id)).toBe(false);

        expect(slide).not.toHaveBeenCalled();
    });
});

describe("a run that did not aim at a seat", () => {
    it("ends standing next to the seat it stopped against", () => {
        const { player, slide, hidePrompt } = fixture();

        player.stayStandingHere();
        player.moveUser(16, new ActiveEventList());

        expect(slide).not.toHaveBeenCalled();
        expect(hidePrompt).toHaveBeenCalled();
    });
});
