import { afterEach, describe, expect, it, vi } from "vitest";
import { Player } from "../../../../src/front/Phaser/Player/Player";
import { Character } from "../../../../src/front/Phaser/Entity/Character";
import { WOKA_SPEED } from "../../../../src/front/Enum/EnvironmentVariable";
import { RUN_ANIMATION_SPEED } from "../../../../src/front/Phaser/Player/Animation";

vi.mock("../../../../src/front/Rules/StatusRules/statusChangerFunctions", () => ({ passStatusToOnline: vi.fn() }));
class TestPlayer extends Player {
    public step(x: number, y: number): void {
        super.moveToPathPosition(x, y);
    }
    public advance(delta: number): void {
        super.followPath(delta);
    }
}
function fixture(
    speed: number = WOKA_SPEED,
    swimming = false,
): {
    player: TestPlayer;
    smoke: ReturnType<typeof vi.fn>;
    animation: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
} {
    const player = Object.create(TestPlayer.prototype) as unknown as TestPlayer;
    const smoke = vi.fn();
    const animation = vi.fn();
    const emit = vi.fn();
    Object.assign(player, {
        x: 10,
        y: 20,
        depth: 100,
        _lastDirection: 0,
        pathWalkingSpeed: speed,
        pathToFollow: [
            { x: 10, y: 20 },
            { x: 100, y: 20 },
        ],
        swimming,
        isSlidingToSeat: false,
        runSmokeTrail: { emit: smoke },
        playAnimation: animation,
        emit,
        getBody: () => ({ offset: { y: 8 }, height: 16 }),
    });
    const prototype = Character.prototype as unknown as {
        moveToPathPosition: (x: number, y: number) => void;
        followPath: (delta: number) => void;
    };
    vi.spyOn(prototype, "moveToPathPosition").mockImplementation((x, y) => {
        player.x = x;
        player.y = y;
    });
    vi.spyOn(prototype, "followPath").mockImplementation(() => {});
    return { player, smoke, animation, emit };
}
afterEach(() => vi.restoreAllMocks());
describe("path sprint", () => {
    it("animates running, emits smoke behind the movement and tells peers it is running", () => {
        const { player, smoke, animation, emit } = fixture(WOKA_SPEED * 2.5);
        player.step(30, 20);
        player.advance(16);
        expect(animation).toHaveBeenCalledWith(0, true, RUN_ANIMATION_SPEED);
        expect(smoke).toHaveBeenCalledWith(30, 36, 20, 0, 99);
        expect(emit).toHaveBeenCalledWith("hasMoved", expect.objectContaining({ moving: true, running: true }));
    });
    it.each([false, true])("does not produce running effects during walking or swimming (swimming=%s)", (swimming) => {
        const { player, smoke, animation } = fixture(swimming ? WOKA_SPEED * 2.5 : WOKA_SPEED, swimming);
        player.step(30, 20);
        expect(smoke).not.toHaveBeenCalled();
        expect(animation).not.toHaveBeenCalled();
    });
    it("does not emit smoke while stationary or restore a moving state after arrival", () => {
        const { player, smoke, emit } = fixture(WOKA_SPEED * 2.5);
        player.step(10, 20);
        expect(smoke).not.toHaveBeenCalled();
        Object.assign(player, { pathToFollow: undefined, pathFollowingResolve: undefined });
        player.advance(16);
        expect(emit).not.toHaveBeenCalled();
    });
});
