import { COLD_LASTS_MS } from "@workadventure/map-editor";
import { CatastropheKind } from "@workadventure/messages";
import type { CatastropheMessage } from "@workadventure/messages";
import { describe, expect, it, vi } from "vitest";
import { ColdView } from "@wa/front/Phaser/Game/Catastrophe/ColdView";

vi.mock("@wa/front/Stores/EffectsStore", () => ({ isEffectShown: () => true }));

function harness(mapCelsius: number | undefined = 10) {
    const graphics = {
        setDepth: vi.fn(() => graphics),
        setVisible: vi.fn(),
        visible: true,
        clear: vi.fn(),
        fillStyle: vi.fn<(color: number, alpha: number) => void>(),
        fillCircle: vi.fn(),
        fillEllipse: vi.fn(),
        fillRect: vi.fn(),
        lineStyle: vi.fn<(width: number, color: number, alpha: number) => void>(),
        strokeCircle: vi.fn(),
        lineBetween: vi.fn(),
        save: vi.fn(),
        translateCanvas: vi.fn(),
        restore: vi.fn(),
        destroy: vi.fn(),
    };
    const scene = { add: { graphics: () => graphics }, markDirty: vi.fn() };
    const view = new ColdView(
        scene as unknown as Phaser.Scene & { markDirty(): void },
        () => false,
        () => (mapCelsius === undefined ? undefined : { temperature: mapCelsius, humidity: 50, windSpeed: 0 }),
        () => 60,
        () => 0,
    );
    const message = (over: Partial<CatastropheMessage> = {}): CatastropheMessage => ({
        id: 9,
        kind: CatastropheKind.CATASTROPHE_COLD,
        x: 320,
        y: 160,
        impactInMs: COLD_LASTS_MS,
        radiusTiles: 3,
        wholeMap: false,
        temperature: -80,
        ...over,
    });
    return { view, scene, graphics, message };
}

describe("ColdView", () => {
    it("costs nothing while no cold air lies on the map", () => {
        const { view, scene, graphics } = harness();
        view.update(1000);
        expect(graphics.clear).not.toHaveBeenCalled();
        expect(scene.markDirty).not.toHaveBeenCalled();
    });

    it("draws the frost on the ground, the mist and the crystals of a mass the server announces", () => {
        const { view, scene, graphics, message } = harness();
        view.report(message(), 1000);
        view.update(1500);
        // The frost gains the ground: half a second in, its core is not as wide as the core of the mass yet.
        expect(graphics.fillCircle).not.toHaveBeenCalledWith(320, 160, 48);
        view.report(message(), 3900);
        view.update(4000);
        // Three seconds in: the core of the true disc the server freezes (3 tiles wide), and the bands around it.
        expect(graphics.fillCircle).toHaveBeenCalledWith(320, 160, 48);
        expect(graphics.strokeCircle.mock.calls.length).toBeGreaterThan(5);
        // The masses the air of a point is read from: this one, where the server told it.
        expect(view.masses(4000)).toEqual([{ id: 9, x: 320, y: 160, radiusTiles: 3, temperature: -80 }]);
        expect(graphics.fillEllipse.mock.calls.length).toBeGreaterThan(5);
        expect(graphics.lineBetween.mock.calls.length).toBeGreaterThan(5);
        expect(scene.markDirty).toHaveBeenCalled();
    });

    it("goes on over a mass let go while it warms, its mist and its crystals fainter, then draws nothing", () => {
        const { view, graphics, message } = harness();
        view.report(message(), 1000);
        view.update(1500);
        // The crystals are drawn as thin lines: how bright the brightest is.
        const brightest = (): number =>
            Math.max(...graphics.lineStyle.mock.calls.map(([width, , alpha]) => (width === 1 ? alpha : 0)));
        const held = brightest();
        graphics.lineStyle.mockClear();
        // Twenty seconds after it was let go: more than a time of warming, still colder than the map.
        view.update(1000 + COLD_LASTS_MS + 20_000);
        const warming = brightest();
        expect(warming).toBeGreaterThan(0);
        expect(warming).toBeLessThan(held);
        const [mass] = view.masses(1000 + COLD_LASTS_MS + 20_000);
        expect(mass.temperature).toBeGreaterThan(-80);
        expect(mass.temperature).toBeLessThan(0);
        // Ten minutes later it is the air of the map: forgotten.
        graphics.clear.mockClear();
        view.update(1000 + 600_000);
        view.update(1000 + 600_100);
        expect(graphics.clear).toHaveBeenCalledTimes(1);
        expect(view.masses(1000 + 600_100)).toEqual([]);
    });

    it("draws nothing for a mass no colder than the air of the map", () => {
        const { view, graphics, message } = harness(-90);
        view.report(message(), 1000);
        view.update(1500);
        expect(graphics.fillCircle).not.toHaveBeenCalled();
    });
});
