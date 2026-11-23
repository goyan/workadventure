import * as Phaser from "phaser";
import { describe, expect, it } from "vitest";
import { CloudLayer } from "../../../../../src/front/Phaser/Game/Weather/CloudLayer";
import type { CloudFrame } from "../../../../../src/front/Phaser/Game/Weather/CloudLayer";

function setup(): { layer: CloudLayer; uniforms: () => Record<string, unknown> } {
    let setupUniforms: ((set: (name: string, value: unknown) => void) => void) | undefined;
    const shader = {
        setOrigin: () => shader,
        setDepth: () => shader,
        setVisible: () => shader,
        setPosition: () => shader,
        setSize: () => shader,
        setTextures: () => shader,
    };
    const texture = {
        width: 64,
        height: 64,
        texture: { key: "cloud-test", setFilter: () => undefined },
        setOrigin: () => texture,
        clear: () => texture,
        fill: () => texture,
        render: () => texture,
    };
    const scene = {
        game: { renderer: Object.create(Phaser.Renderer.WebGL.WebGLRenderer.prototype) },
        time: { now: 1000 },
        textures: { exists: () => true, get: () => ({ get: () => ({ realWidth: 64, realHeight: 64 }) }) },
        make: { renderTexture: () => texture },
        add: {
            shader: (config: { setupUniforms: typeof setupUniforms }) => {
                setupUniforms = config.setupUniforms;
                return shader;
            },
        },
    } as unknown as Phaser.Scene;
    const layer = CloudLayer.create(scene, 1);
    if (!layer) throw new Error("Expected a WebGL cloud layer");
    return {
        layer,
        uniforms: () => {
            const values: Record<string, unknown> = {};
            setupUniforms?.((name, value) => {
                values[name] = value;
            });
            return values;
        },
    };
}

const frame: CloudFrame = {
    view: { x: 0, y: 0, width: 32, height: 32 },
    sky: { x: 150_000_000_000, y: -90_000_000_000 },
    clouds: { patches: [], tones: { lit: 0xffffff, mid: 0xffffff, shade: 0xffffff }, body: 1, shadow: undefined },
    veils: [],
    outdoors: undefined,
    overRoofs: 0,
    rainbow: undefined,
    still: false,
};

describe("cloud motion between thickness redraws", () => {
    it("frays cumulus with the warped noise and keeps the billows for fog", () => {
        const { layer, uniforms } = setup();
        const clouds = frame.clouds;
        if (!clouds) throw new Error("Expected cloud test data");
        layer.draw({ ...frame, clouds: { ...clouds, cumulus: true } });
        expect(uniforms().uCumulus).toBe(1);
        layer.draw(frame);
        expect(uniforms().uCumulus).toBe(0);
    });
    it("moves by fractional map pixels even with a sky drift of billions of pixels", () => {
        const { layer, uniforms } = setup();
        layer.draw(frame);
        expect(layer.moveSky({ x: frame.sky.x + 0.5, y: frame.sky.y - 0.25 })).toBe(true);
        expect(uniforms().uMotion).toEqual([0.5, -0.25]);
        expect(layer.moveSky({ x: frame.sky.x + 1, y: frame.sky.y - 0.5 })).toBe(true);
        expect(uniforms().uMotion).toEqual([1, -0.5]);
    });

    it("starts from the new texture after a redraw", () => {
        const { layer, uniforms } = setup();
        layer.draw(frame);
        layer.moveSky({ x: frame.sky.x + 4, y: frame.sky.y + 3 });
        layer.draw({ ...frame, sky: { x: frame.sky.x + 4, y: frame.sky.y + 3 } });
        expect(uniforms().uMotion).toEqual([0, 0]);
    });

    it("keeps reduced motion still and requests no redraw for a hidden layer", () => {
        const { layer, uniforms } = setup();
        layer.draw({ ...frame, still: true });
        expect(layer.moveSky({ x: frame.sky.x + 4, y: frame.sky.y + 3 })).toBe(false);
        expect(uniforms().uMotion).toEqual([0, 0]);
        layer.hide();
        expect(layer.moveSky({ x: frame.sky.x + 8, y: frame.sky.y + 6 })).toBe(false);
        expect(uniforms().uMotion).toEqual([0, 0]);
    });
});
