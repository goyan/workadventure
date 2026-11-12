import { describe, expect, it } from "vitest";
import type { NightFrame } from "../../../../../src/front/Phaser/Game/Night/NightRenderDecision";
import { nightRenderAction } from "../../../../../src/front/Phaser/Game/Night/NightRenderDecision";

function frame(overrides: Partial<NightFrame> = {}): NightFrame {
    return {
        opacity: 0.6,
        editorOpen: false,
        disabled: false,
        view: { x: 100, y: 200, width: 800, height: 600, zoom: 2 },
        lit: [{ id: "office", x: 0, y: 0, width: 64, height: 64, intensity: 1 }],
        halos: [{ id: "local", x: 32, y: 32, radius: 48 }],
        lamps: [{ id: "lamp", x: 10, y: 20, size: 384, textureKey: "rgb-lamp:lamp:96", revision: 1 }],
        fading: false,
        ...overrides,
    };
}

describe("nightRenderAction", () => {
    it("hides the veil during the day", () => {
        expect(nightRenderAction(frame({ opacity: 0 }), frame())).toBe("hidden");
    });

    it("hides the veil while the map editor is open", () => {
        expect(nightRenderAction(frame({ editorOpen: true }), frame())).toBe("hidden");
    });

    it("hides the veil when the player turned night off", () => {
        expect(nightRenderAction(frame({ disabled: true }), frame())).toBe("hidden");
    });

    it("draws the first night frame", () => {
        expect(nightRenderAction(frame(), undefined)).toBe("draw");
    });

    it("keeps the veil when nothing changed", () => {
        expect(nightRenderAction(frame(), frame())).toBe("keep");
    });

    it("draws when the view moved by one pixel", () => {
        const moved = frame({ view: { x: 101, y: 200, width: 800, height: 600, zoom: 2 } });
        expect(nightRenderAction(moved, frame())).toBe("draw");
    });

    it("draws when the view was resized", () => {
        const resized = frame({ view: { x: 100, y: 200, width: 801, height: 600, zoom: 2 } });
        expect(nightRenderAction(resized, frame())).toBe("draw");
    });

    it("draws when the zoom changed", () => {
        const zoomed = frame({ view: { x: 100, y: 200, width: 800, height: 600, zoom: 1.75 } });
        expect(nightRenderAction(zoomed, frame())).toBe("draw");
    });

    it("draws when the opacity changed", () => {
        expect(nightRenderAction(frame({ opacity: 0.3 }), frame())).toBe("draw");
    });

    it("draws when the intensity of an area changed", () => {
        const dimmer = frame({ lit: [{ id: "office", x: 0, y: 0, width: 64, height: 64, intensity: 0.5 }] });
        expect(nightRenderAction(dimmer, frame())).toBe("draw");
    });

    it("draws when an area lit up or went dark", () => {
        expect(nightRenderAction(frame({ lit: [] }), frame())).toBe("draw");
        const more = frame({
            lit: [
                { id: "office", x: 0, y: 0, width: 64, height: 64, intensity: 1 },
                { id: "kitchen", x: 64, y: 0, width: 32, height: 32, intensity: 1 },
            ],
        });
        expect(nightRenderAction(more, frame())).toBe("draw");
    });

    it("draws when a lit area changed place or size", () => {
        const moved = frame({ lit: [{ id: "office", x: 32, y: 0, width: 64, height: 64, intensity: 1 }] });
        expect(nightRenderAction(moved, frame())).toBe("draw");
        const renamed = frame({ lit: [{ id: "other", x: 0, y: 0, width: 64, height: 64, intensity: 1 }] });
        expect(nightRenderAction(renamed, frame())).toBe("draw");
    });

    it("keeps the veil when the halos did not change", () => {
        const halos = [
            { id: "local", x: 32, y: 32, radius: 48 },
            { id: "7", x: 300, y: 200, radius: 48 },
        ];
        expect(nightRenderAction(frame({ halos }), frame({ halos: halos.map((halo) => ({ ...halo })) }))).toBe("keep");
    });

    it("draws when a halo moved", () => {
        expect(nightRenderAction(frame({ halos: [{ id: "local", x: 33, y: 32, radius: 48 }] }), frame())).toBe("draw");
        expect(nightRenderAction(frame({ halos: [{ id: "local", x: 32, y: 31, radius: 48 }] }), frame())).toBe("draw");
    });

    it("draws when a halo radius changed", () => {
        expect(nightRenderAction(frame({ halos: [{ id: "local", x: 32, y: 32, radius: 56 }] }), frame())).toBe("draw");
    });

    it("draws when a halo appeared or disappeared", () => {
        expect(nightRenderAction(frame({ halos: [] }), frame())).toBe("draw");
        const more = frame({
            halos: [
                { id: "local", x: 32, y: 32, radius: 48 },
                { id: "7", x: 300, y: 200, radius: 48 },
            ],
        });
        expect(nightRenderAction(more, frame())).toBe("draw");
        expect(nightRenderAction(frame({ halos: [{ id: "7", x: 32, y: 32, radius: 48 }] }), frame())).toBe("draw");
    });

    it("draws while an area is fading", () => {
        expect(nightRenderAction(frame({ fading: true }), frame({ fading: true }))).toBe("draw");
    });

    it("draws again when night comes back after the veil was hidden", () => {
        expect(nightRenderAction(frame(), frame({ editorOpen: true }))).toBe("draw");
        expect(nightRenderAction(frame(), frame({ opacity: 0 }))).toBe("draw");
        expect(nightRenderAction(frame(), frame({ disabled: true }))).toBe("draw");
    });

    it("draws when the shape of the light of an RGB lamp changed, though it did not move", () => {
        const reshaped = frame({
            lamps: [{ id: "lamp", x: 10, y: 20, size: 384, textureKey: "rgb-lamp:lamp:96", revision: 2 }],
        });
        expect(nightRenderAction(reshaped, frame())).toBe("draw");
    });

    it("draws when an RGB lamp moved, appeared or went away", () => {
        const moved = frame({
            lamps: [{ id: "lamp", x: 11, y: 20, size: 384, textureKey: "rgb-lamp:lamp:96", revision: 1 }],
        });
        expect(nightRenderAction(moved, frame())).toBe("draw");
        expect(nightRenderAction(frame({ lamps: [] }), frame())).toBe("draw");
        expect(nightRenderAction(frame(), frame({ lamps: [] }))).toBe("draw");
    });
});
