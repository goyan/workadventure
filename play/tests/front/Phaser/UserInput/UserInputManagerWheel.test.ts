import * as Phaser from "phaser";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { CameraManager } from "../../../../src/front/Phaser/Game/CameraManager";
import { GameSceneUserInputHandler } from "../../../../src/front/Phaser/UserInput/GameSceneUserInputHandler";
import { UserInputManager } from "../../../../src/front/Phaser/UserInput/UserInputManager";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";
import { releaseNotesVisibleStore } from "../../../../src/front/Stores/ReleaseNotesStore";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";
import { setLocale } from "../../../../src/i18n/i18n-svelte";

// The wheel integration only needs the real handler methods, not character rendering or UI stores.
vi.mock("../../../../src/front/Phaser/Player/Player", () => ({ Player: class {} }));
vi.mock("../../../../src/front/Phaser/Entity/RemotePlayer", () => ({ RemotePlayer: class {} }));
vi.mock("../../../../src/front/Phaser/Game/ActivatableInterface", () => ({ isActivatable: vi.fn() }));
vi.mock("../../../../src/front/Touch/TouchScreenManager", () => ({
    touchScreenManager: { supportTouchScreen: false, primaryTouchDevice: false },
}));
vi.mock("../../../../src/front/Stores/MenuStore", () => ({}));
vi.mock("../../../../src/front/Stores/FollowStore", () => ({}));
vi.mock("../../../../src/front/Stores/EmoteStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        emoteMenuStore: writable(false),
        displayEmote: vi.fn(),
        isEmoteIndex: vi.fn(),
    };
});
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({}));
vi.mock("../../../../src/front/Chat/Stores/ChatStore", () => ({}));
vi.mock("../../../../src/front/Components/PopUp/SayPopUp.svelte", () => ({ default: vi.fn() }));

describe("UserInputManager wheel events", () => {
    let scene: ReturnType<typeof mock<GameScene>>;
    let cameraManager: ReturnType<typeof mock<CameraManager>>;
    let manager: UserInputManager;

    function emitWheel(event: WheelEvent, deltaX: number, deltaY: number): void {
        const pointer = mock<Phaser.Input.Pointer>();
        pointer.event = event;
        scene.input.emit(Phaser.Input.Events.POINTER_WHEEL, pointer, [], deltaX, deltaY, 0);
    }

    beforeAll(async () => {
        await loadLocaleAsync("en-US");
        setLocale("en-US");
    });

    beforeEach(() => {
        mapEditorModeStore.set(false);

        const inputEmitter = new Phaser.Events.EventEmitter();
        const input = mock<Phaser.Input.InputPlugin>();
        input.keyboard = mock<Phaser.Input.Keyboard.KeyboardPlugin>();
        input.on.mockImplementation((event, listener, context) => {
            inputEmitter.on(event, listener, context);
            return input;
        });
        input.off.mockImplementation((event, listener, context) => {
            inputEmitter.off(event, listener, context);
            return input;
        });
        input.emit.mockImplementation((event, ...args) => inputEmitter.emit(event, ...args));

        scene = mock<GameScene>();
        Object.defineProperty(scene, "input", { configurable: true, value: input });
        Object.defineProperty(scene, "game", {
            configurable: true,
            value: { canvas: document.createElement("canvas"), events: new Phaser.Events.EventEmitter() },
        });
        Object.defineProperty(scene, "events", { configurable: true, value: new Phaser.Events.EventEmitter() });
        cameraManager = mock<CameraManager>();
        cameraManager.isZoomLocked.mockReturnValue(false);
        scene.getCameraManager.mockReturnValue(cameraManager);

        const handler = new GameSceneUserInputHandler(scene);
        manager = new UserInputManager(scene, handler);
        scene.userInputManager = manager;
    });

    afterEach(() => {
        releaseNotesVisibleStore.set(false);
        manager.destroy();
        mapEditorModeStore.set(false);
        vi.restoreAllMocks();
    });

    it("routes trackpad scrolling and pinch zoom through the active scene handler", () => {
        emitWheel(new WheelEvent("wheel", { deltaX: 4, deltaY: 6, deltaMode: WheelEvent.DOM_DELTA_PIXEL }), 4, 6);
        emitWheel(new WheelEvent("wheel", { ctrlKey: true, deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_PIXEL }), 0, 3);
        emitWheel(new WheelEvent("wheel", { deltaY: 100, deltaMode: WheelEvent.DOM_DELTA_PIXEL }), 0, 100);

        expect(cameraManager.panBy.mock.calls).toEqual([[4, 6]]);
        expect(scene.handleMouseWheel.mock.calls).toEqual([
            [3, expect.anything(), 6],
            [100, expect.anything(), 1],
        ]);
    });

    it("blocks game controls while reading release notes and restores them on close", () => {
        releaseNotesVisibleStore.set(true);
        emitWheel(new WheelEvent("wheel", { deltaY: 6 }), 0, 6);

        expect(manager.isControlsEnabled).toBe(false);
        expect(manager.getEventListForGameTick().any()).toBe(false);
        expect(cameraManager.panBy.mock.calls).toEqual([]);
        expect(scene.handleMouseWheel.mock.calls).toEqual([]);

        releaseNotesVisibleStore.set(false);
        expect(manager.isControlsEnabled).toBe(true);
    });
});
