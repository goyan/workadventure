import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import type { CameraManager } from "../../../../src/front/Phaser/Game/CameraManager";
import type { UserInputManager } from "../../../../src/front/Phaser/UserInput/UserInputManager";
import type { ActivatablesManager } from "../../../../src/front/Phaser/Game/ActivatablesManager";
import { GameSceneUserInputHandler } from "../../../../src/front/Phaser/UserInput/GameSceneUserInputHandler";
import { isActivatable } from "../../../../src/front/Phaser/Game/ActivatableInterface";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";
import { WOKA_SPEED } from "../../../../src/front/Enum/EnvironmentVariable";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";
import { setLocale } from "../../../../src/i18n/i18n-svelte";

// Pointer navigation does not need character rendering or the chat and menu UI.
vi.mock("../../../../src/front/Phaser/Player/Player", () => ({ Player: class {} }));
vi.mock("../../../../src/front/Phaser/Entity/RemotePlayer", () => ({ RemotePlayer: class {} }));
vi.mock("../../../../src/front/Phaser/Game/ActivatableInterface", () => ({ isActivatable: vi.fn() }));
vi.mock("../../../../src/front/Stores/MenuStore", () => ({}));
vi.mock("../../../../src/front/Stores/FollowStore", () => ({}));
vi.mock("../../../../src/front/Stores/EmoteStore", () => ({}));
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({}));
vi.mock("../../../../src/front/Chat/Stores/ChatStore", () => ({}));
vi.mock("../../../../src/front/Components/PopUp/SayPopUp.svelte", () => ({ default: vi.fn() }));

describe("GameSceneUserInputHandler pointer navigation", () => {
    const camera = mock<Phaser.Cameras.Scene2D.Camera>();
    const cameraManager = mock<CameraManager>();
    const activatablesManager = mock<ActivatablesManager>();
    let scene: ReturnType<typeof mock<GameScene>>;
    let handler: GameSceneUserInputHandler;

    function pointer(button = 0, detail = 2): ReturnType<typeof mock<Phaser.Input.Pointer>> {
        const result = mock<Phaser.Input.Pointer>({
            x: 120,
            y: 160,
            wasTouch: false,
            prevPosition: new Phaser.Math.Vector2(120, 160),
        });
        result.event = new MouseEvent("mouseup", { button, detail });
        result.leftButtonReleased.mockReturnValue(button === 0);
        result.leftButtonDown.mockReturnValue(button === 0);
        result.getDuration.mockReturnValue(50);
        return result;
    }

    beforeAll(async () => {
        await loadLocaleAsync("en-US");
        setLocale("en-US");
    });

    beforeEach(() => {
        vi.clearAllMocks();
        mapEditorModeStore.set(false);
        vi.mocked(isActivatable).mockReturnValue(false);
        camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(480, 640));
        cameraManager.getCamera.mockReturnValue(camera);
        cameraManager.canPan.mockReturnValue(true);
        scene = mock<GameScene>({
            userInputManager: mock<UserInputManager>({ isControlsEnabled: true, isRightClickEnabled: true }),
        });
        scene.Map = mock<Phaser.Tilemaps.Tilemap>({ widthInPixels: 1504, heightInPixels: 1184 });
        scene.getCameraManager.mockReturnValue(cameraManager);
        scene.getActivatablesManager.mockReturnValue(activatablesManager);
        scene.getGameMapFrontWrapper.mockReturnValue(
            mock<GameMapFrontWrapper>({ getTileDimensions: () => ({ width: 32, height: 32 }) }),
        );
        scene.moveTo.mockResolvedValue({ x: 480, y: 640, cancelled: false });
        handler = new GameSceneUserInputHandler(scene);
    });

    afterEach(() => {
        mapEditorModeStore.set(false);
        vi.restoreAllMocks();
    });

    it("runs to the world point under a double left-click using the existing pathfinding", () => {
        handler.handlePointerUpEvent(pointer(0, 1), []);
        handler.handlePointerUpEvent(pointer(0, 2), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 496, y: 656 }, true, WOKA_SPEED * 2.5]]);
        expect(camera.getWorldPoint.mock.calls).toEqual([[120, 160]]);
    });

    it("does not start navigation after a single left-click", () => {
        handler.handlePointerUpEvent(pointer(0, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("keeps right-click navigation at its existing speed", () => {
        handler.handlePointerUpEvent(pointer(2, 1), []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("keeps touch navigation at its existing speed", () => {
        const touch = pointer();
        touch.wasTouch = true;
        handler.handlePointerUpEvent(touch, []);

        expect(scene.moveTo.mock.calls).toEqual([[{ x: 480, y: 640 }, true, undefined]]);
    });

    it("does not run when controls are disabled even if right-click is still enabled", () => {
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: false, isRightClickEnabled: true });
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("respects the scripting API disabling navigation by click", () => {
        scene.userInputManager = mock<UserInputManager>({ isControlsEnabled: true, isRightClickEnabled: false });
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("does not run while editing the map", () => {
        mapEditorModeStore.set(true);
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("pans the camera without running when a drag ends with a double-click count", () => {
        const drag = pointer();
        handler.handlePointerDownEvent(drag, []);
        drag.x += 20;
        drag.prevPosition.set(120, 160);
        handler.handlePointerMoveEvent(drag, []);
        handler.handlePointerUpEvent(drag, []);

        expect(cameraManager.panBy.mock.calls).toEqual([[-20, 0]]);
        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("activates an interactive object without starting navigation", () => {
        const object = mock<Phaser.GameObjects.GameObject>();
        vi.mocked(isActivatable).mockReturnValue(true);
        handler.handlePointerUpEvent(pointer(), [object]);

        expect(activatablesManager.handlePointerDownEvent.mock.calls).toEqual([[object]]);
        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("does not turn a long press into running", () => {
        const longPress = pointer();
        longPress.getDuration.mockReturnValue(300);
        handler.handlePointerUpEvent(longPress, []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it.each([
        [-1, 48],
        [1504, 48],
        [16, -1],
        [16, 1184],
    ])("does not run into the inaccessible exterior at (%s, %s)", (x, y) => {
        camera.getWorldPoint.mockReturnValue(new Phaser.Math.Vector2(x, y));
        handler.handlePointerUpEvent(pointer(), []);

        expect(scene.moveTo.mock.calls).toEqual([]);
    });

    it("handles an unreachable destination without an unhandled rejection", async () => {
        const error = new Error("No path found");
        const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        scene.moveTo.mockRejectedValue(error);

        handler.handlePointerUpEvent(pointer(), []);
        await Promise.resolve();

        expect(warning).toHaveBeenCalledWith(error);
    });

    describe("camera panning", () => {
        function trackpadScroll(): ReturnType<typeof mock<Phaser.Input.Pointer>> {
            const wheel = pointer();
            wheel.event = new WheelEvent("wheel", { deltaX: 4, deltaY: 6, deltaMode: WheelEvent.DOM_DELTA_PIXEL });
            return wheel;
        }

        it("pans with a two-finger trackpad scroll outside the map editor", () => {
            handler.handleMouseWheelEvent(trackpadScroll(), [], 4, 6, 0);

            expect(cameraManager.panBy.mock.calls).toEqual([[4, 6]]);
        });

        it("pans with a two-finger trackpad scroll while editing the map", () => {
            mapEditorModeStore.set(true);
            handler.handleMouseWheelEvent(trackpadScroll(), [], 4, 6, 0);

            expect(cameraManager.panBy.mock.calls).toEqual([[4, 6]]);
        });

        it("starts dragging with the left button outside the map editor", () => {
            const drag = pointer();
            handler.handlePointerDownEvent(drag, []);
            drag.x += 20;
            handler.handlePointerMoveEvent(drag, []);

            expect(cameraManager.panBy.mock.calls).toEqual([[-20, 0]]);
        });

        it("leaves the left button drag to the tools while editing the map", () => {
            mapEditorModeStore.set(true);
            const drag = pointer();
            handler.handlePointerDownEvent(drag, []);
            drag.x += 20;
            handler.handlePointerMoveEvent(drag, []);

            expect(cameraManager.panBy.mock.calls).toEqual([]);
        });
    });
});
