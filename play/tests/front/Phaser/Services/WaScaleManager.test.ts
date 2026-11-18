import * as Phaser from "phaser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "../../../../src/front/Phaser/Game/Game";
import { WaScaleManager, WaScaleManagerEvent } from "../../../../src/front/Phaser/Services/WaScaleManager";

const viewport = vi.hoisted(() => ({ width: 1280, height: 800 }));
vi.mock("../../../../src/front/Stores/CoWebsiteStore", () => ({
    coWebsiteManager: { getGameSize: () => viewport },
}));

function setup(): {
    manager: WaScaleManager;
    camera: Phaser.Cameras.Scene2D.Camera;
    scale: { width: number; height: number; zoom: number };
    events: Phaser.Events.EventEmitter;
} {
    const camera = new Phaser.Cameras.Scene2D.Camera(0, 0, viewport.width, viewport.height);
    const scale = {
        width: viewport.width,
        height: viewport.height,
        zoom: 1,
        resize(width: number, height: number): void {
            this.width = width;
            this.height = height;
            camera.setSize(width, height);
        },
        setZoom(zoom: number): void {
            this.zoom = zoom;
        },
    };
    const events = new Phaser.Events.EventEmitter();
    const game = {
        scale,
        events,
        scene: { getScenes: () => [{ cameras: { main: camera } }] },
        markDirty: vi.fn(),
    } as unknown as Game;
    const manager = new WaScaleManager(640 * 480, 196 * 196);
    manager.setGame(game);
    manager.mapSize = { width: 10000, height: 10000 };
    return { manager, camera, scale, events };
}

beforeEach(() => {
    viewport.width = 1280;
    viewport.height = 800;
    vi.stubGlobal("devicePixelRatio", 2);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("viewport resize", () => {
    it("keeps manual zoom in a focus zone when opening and closing a desktop side panel", () => {
        const { manager, camera, events } = setup();
        const target = { x: 4608, y: 2368, width: 384, height: 320 };
        manager.setFocusTarget(target);
        manager.setZoomModifier(manager.getTargetZoomModifierFor(target.width * 2, target.height * 2), camera);
        manager.setZoomModifier(0.2, camera);
        const refresh = vi.fn();
        events.on(WaScaleManagerEvent.RefreshFocusOnTarget, refresh);

        for (const width of [920, 1280]) {
            viewport.width = width;
            manager.applyNewSize();
            manager.refreshFocusOnTarget();

            expect(manager.zoomModifier).toBe(0.2);
            expect(manager.getFocusTarget()).toEqual(target);
            expect(refresh).toHaveBeenLastCalledWith(target);
        }
    });

    it.each([
        { devicePixelRatio: 1, zoom: 0.8 },
        { devicePixelRatio: 2, zoom: 0.4 },
    ])("updates the active camera across canvas/camera zoom transitions at DPR $devicePixelRatio", (options) => {
        vi.stubGlobal("devicePixelRatio", options.devicePixelRatio);
        const { manager, camera, scale } = setup();
        manager.setZoomModifier(options.zoom, camera);
        expect(camera.zoom).toBe(1);

        viewport.width = 920;
        manager.applyNewSize();
        expect(camera.zoom).toBeLessThan(1);
        expect(camera.zoom * scale.zoom).toBeCloseTo(manager.getActualZoom(), 2);

        viewport.width = 1280;
        manager.applyNewSize();
        expect(camera.zoom).toBe(1);
        expect(camera.zoom * scale.zoom).toBeCloseTo(manager.getActualZoom(), 2);
        expect(manager.zoomModifier).toBe(options.zoom);
    });

    it("refreshes a point-only focus and ignores an absent target", () => {
        const { manager, events } = setup();
        const refresh = vi.fn();
        events.on(WaScaleManagerEvent.RefreshFocusOnTarget, refresh);
        manager.refreshFocusOnTarget();
        expect(refresh).not.toHaveBeenCalled();

        const target = { x: 1200, y: 800 };
        manager.setFocusTarget(target);
        manager.refreshFocusOnTarget();
        expect(refresh).toHaveBeenCalledExactlyOnceWith(target);
    });
});
