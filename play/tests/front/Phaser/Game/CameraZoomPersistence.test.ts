import * as Phaser from "phaser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraManager } from "../../../../src/front/Phaser/Game/CameraManager";
import type { GameScene } from "../../../../src/front/Phaser/Game/GameScene";
import type { WaScaleManager } from "../../../../src/front/Phaser/Services/WaScaleManager";
import { mapEditorModeStore } from "../../../../src/front/Stores/MapEditorStore";
import { ZOOM_SAVE_DELAY_MS } from "../../../../src/front/Phaser/Game/ZoomPersistence";

vi.mock("../../../../src/front/Phaser/Player/Player", () => ({ hasMovedEventName: "hasMoved" }));
vi.mock("../../../../src/front/Phaser/Services/WaScaleManager", () => ({
    WaScaleManagerEvent: { RefreshFocusOnTarget: "refreshFocus", ZoomChanged: "zoomChanged" },
}));
vi.mock("../../../../src/front/Phaser/UserInput/UserInputManager", () => ({
    UserInputEvent: { MoveLeft: 1, MoveUp: 2, MoveRight: 3, MoveDown: 4 },
}));

const STORAGE_KEY = "cameraZoomModifier";

const managers: CameraManager[] = [];
beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
});
afterEach(() => {
    managers.splice(0).forEach((manager) => manager.destroy());
    mapEditorModeStore.set(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** A camera manager on a fake WaScaleManager that, like the real one, clamps the zoom and emits ZoomChanged. */
function setup({ maxZoomModifier = Number.POSITIVE_INFINITY } = {}) {
    const camera = new Phaser.Cameras.Scene2D.Camera(0, 0, 800, 600);
    Object.defineProperty(camera, "scaleManager", { value: { zoom: 1, width: 800, height: 600 } });
    Object.defineProperty(camera, "sceneManager", { value: { customViewports: 0 } });
    const player = { x: 1200, y: 1000, getPathAhead: () => [] };
    const gameEvents = new Phaser.Events.EventEmitter();
    const scene = {
        cameras: { main: camera },
        game: { events: gameEvents },
        events: new Phaser.Events.EventEmitter(),
        scale: { zoom: 1 },
        CurrentPlayer: player,
        markDirty: vi.fn(),
        reposition: vi.fn(),
        sendViewportToServer: vi.fn(),
        tweens: { addCounter: vi.fn(() => ({ getValue: () => 1, stop: vi.fn(), destroy: vi.fn() })) },
    } as unknown as GameScene;
    let modifier = 1;
    let focusTarget: { x: number; y: number } | undefined;
    const setZoomModifier = vi.fn((value: number, cam: Phaser.Cameras.Scene2D.Camera) => {
        const clamped = Math.min(value, maxZoomModifier);
        if (clamped === modifier) return;
        modifier = clamped;
        cam.setZoom(clamped);
        gameEvents.emit("zoomChanged", clamped);
    });
    const scale = {
        getTargetZoomModifierFor: () => 1,
        getFocusTarget: () => focusTarget,
        setFocusTarget: vi.fn(),
        saveZoom: vi.fn(),
        get zoomModifier() {
            return modifier;
        },
        setZoomModifier,
    } as unknown as WaScaleManager;
    const create = () => {
        const manager = new CameraManager(scene, { width: 4000, height: 3000 }, scale);
        managers.push(manager);
        return manager;
    };
    // What the wheel, the pinch or the zoom buttons end up doing: a new zoom modifier, applied by WaScaleManager.
    const userZoom = (value: number) => setZoomModifier(value, camera);
    const setFocusTarget = (target: { x: number; y: number } | undefined) => {
        focusTarget = target;
    };
    return { create, userZoom, setZoomModifier, setFocusTarget, camera, gameEvents, getModifier: () => modifier };
}

describe("camera zoom kept across page reloads", () => {
    it("starts at the zoom saved last, within the limits of this screen and map, without overwriting it", () => {
        localStorage.setItem(STORAGE_KEY, "2.5");
        const { create, setZoomModifier, getModifier, camera, gameEvents } = setup({ maxZoomModifier: 2 });

        create();

        expect(setZoomModifier).toHaveBeenCalledWith(2.5, camera, false);
        expect(getModifier()).toBe(2);
        // A window resize re-emits ZoomChanged with the same zoom modifier (only the canvas scale changed).
        gameEvents.emit("zoomChanged", 2);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        // A bigger screen or map may allow the saved zoom again: keep the user's choice, not the clamped value.
        expect(localStorage.getItem(STORAGE_KEY)).toBe("2.5");
    });

    it("keeps the default zoom when nothing valid was saved", () => {
        localStorage.setItem(STORAGE_KEY, "garbage");
        const { create, setZoomModifier } = setup();

        create();

        expect(setZoomModifier).not.toHaveBeenCalled();
    });

    it("saves the zoom the user settles on in game mode", () => {
        const { create, userZoom } = setup();
        create();

        userZoom(1.2);
        userZoom(1.4);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS - 1);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
        vi.advanceTimersByTime(1);
        expect(localStorage.getItem(STORAGE_KEY)).toBe("1.4");
    });

    it("does not save a zoom imposed by a focus zone", () => {
        const { create, userZoom, setFocusTarget } = setup();
        create();

        setFocusTarget({ x: 10, y: 10 });
        userZoom(3);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

        // Back to the user's zoom when leaving the zone: that one is saved.
        setFocusTarget(undefined);
        userZoom(1.1);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS);
        expect(localStorage.getItem(STORAGE_KEY)).toBe("1.1");
    });

    it("does not save the zoom of the map editor", () => {
        const { create, userZoom } = setup();
        create();

        mapEditorModeStore.set(true);
        userZoom(0.3);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("does not save the temporary zoom of a tap-walk framing", () => {
        const { create, userZoom } = setup();
        const manager = create();

        manager.startWalkFraming({ x: 3000, y: 2000 });
        userZoom(0.5);
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("saves a pending zoom at once when the page is left or the scene closes", () => {
        const { create, userZoom } = setup();
        const manager = create();

        userZoom(1.7);
        window.dispatchEvent(new Event("pagehide"));
        expect(localStorage.getItem(STORAGE_KEY)).toBe("1.7");

        userZoom(0.9);
        managers.splice(managers.indexOf(manager), 1);
        manager.destroy();
        expect(localStorage.getItem(STORAGE_KEY)).toBe("0.9");

        // Once destroyed, the manager neither listens to the page nor writes later.
        localStorage.clear();
        window.dispatchEvent(new Event("pagehide"));
        vi.advanceTimersByTime(ZOOM_SAVE_DELAY_MS * 2);
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
});
