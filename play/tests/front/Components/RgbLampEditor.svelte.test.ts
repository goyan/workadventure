import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { mock } from "vitest-mock-extended";
import type { EntityDataProperties, EntityDataProperty } from "@workadventure/map-editor";
import type { Entity } from "../../../src/front/Phaser/ECS/Entity";
import type { RgbLampSettings } from "../../../src/front/Phaser/Game/Lamps/RgbLampSettings";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const label = (text: string) => () => text;
    const LL = readable({
        mapEditor: {
            properties: {
                rgbLamp: {
                    label: label("Light of the lamp"),
                    description: label("desc"),
                    color: label("Colour"),
                    radius: label("Reach"),
                    angle: label("Opening"),
                    direction: label("Direction"),
                },
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            getGameMapFrontWrapper: () => ({ getMap: () => ({ tilewidth: 32 }) }),
        }),
    },
}));

interface FakeHandles {
    settings: () => RgbLampSettings;
    onPreview: (settings: RgbLampSettings) => void;
    onChange: (settings: RgbLampSettings) => void;
    destroyed: boolean;
}
const handles: FakeHandles[] = [];
// The handles need a Phaser scene: only what the editor gives them, and what they give back, is looked at here.
vi.mock("../../../src/front/Phaser/Components/MapEditor/RgbLampHandles", () => ({
    RgbLampHandles: class {
        private readonly fake: FakeHandles;
        constructor(
            _scene: unknown,
            _entity: unknown,
            _tileSize: number,
            settings: () => RgbLampSettings,
            onPreview: (settings: RgbLampSettings) => void,
            onChange: (settings: RgbLampSettings) => void,
        ) {
            this.fake = { settings, onPreview, onChange, destroyed: false };
            handles.push(this.fake);
        }
        destroy(): void {
            this.fake.destroyed = true;
        }
    },
}));

const { default: RgbLampEditor } =
    await import("../../../src/front/Components/MapEditor/EntityEditor/RgbLampEditor.svelte");
const { rgbLampPreviewStore } = await import("../../../src/front/Stores/RgbLampStore");

describe("RgbLampEditor", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        handles.length = 0;
        rgbLampPreviewStore.set(undefined);
    });

    function render(properties: EntityDataProperties = [], canEdit = true) {
        target = document.createElement("div");
        document.body.appendChild(target);
        const saved: EntityDataProperty[] = [];
        let current = properties;
        const lamp = mock<Entity>({ entityId: "lamp-1" });
        Object.defineProperty(lamp, "canEdit", { value: canEdit });
        lamp.getProperties.mockImplementation(() => current);
        lamp.setProperty.mockImplementation((property) => {
            saved.push(property);
            current = [property];
        });
        component = mount(RgbLampEditor, { target, props: { entity: lamp } });
        flushSync();
        return { saved, lamp };
    }
    const sliders = () => [...target.querySelectorAll<HTMLInputElement>('input[type="range"]')];
    const colour = () => target.querySelector<HTMLInputElement>('input[type="color"]');
    function slide(slider: HTMLInputElement, value: string, release = true): void {
        slider.value = value;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (release) slider.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
    }

    it("shows the defaults of a lamp nothing was set on: warm white, 6 tiles, all around, downwards", () => {
        render();
        expect(colour()?.value).toBe("#ffd9a0");
        const [radius, angle, direction] = sliders();
        expect(sliders()).toHaveLength(3);
        expect([radius.min, radius.max, radius.value]).toEqual(["1", "20", "6"]);
        expect([angle.min, angle.max, angle.value]).toEqual(["10", "360", "360"]);
        expect([direction.min, direction.max, direction.value]).toEqual(["0", "359", "90"]);
    });

    it("shows what was set on the lamp", () => {
        render([{ id: "p", type: "rgbLampPropertyData", color: "#00ff00", radius: 10, direction: 180, angle: 45 }]);
        expect(colour()?.value).toBe("#00ff00");
        expect(sliders().map((slider) => slider.value)).toEqual(["10", "45", "180"]);
    });

    it("names what each control sets", () => {
        render();
        for (const text of ["Light of the lamp", "Colour", "Reach", "Opening", "Direction"]) {
            expect(target.textContent).toContain(text);
        }
    });

    it("saves the reach as a property of the lamp when the slider is released, with the other settings", () => {
        const { saved } = render();
        slide(sliders()[0], "12");
        expect(saved).toHaveLength(1);
        expect(saved[0]).toMatchObject({
            type: "rgbLampPropertyData",
            color: "#ffd9a0",
            radius: 12,
            direction: 90,
            angle: 360,
        });
        expect(saved[0].id).toBeTruthy();
    });

    it("keeps the id of the property already on the lamp", () => {
        const { saved } = render([
            { id: "p", type: "rgbLampPropertyData", color: "#00ff00", radius: 10, direction: 180, angle: 45 },
        ]);
        slide(sliders()[1], "90");
        expect(saved[0]).toEqual({
            id: "p",
            type: "rgbLampPropertyData",
            color: "#00ff00",
            radius: 10,
            direction: 180,
            angle: 90,
        });
    });

    it("shows a slider being dragged on the map before it is released, then lets the saved lamp speak", () => {
        const { saved } = render();
        slide(sliders()[0], "3", false);
        expect(saved).toHaveLength(0);
        expect(get(rgbLampPreviewStore)).toEqual({
            entityId: "lamp-1",
            settings: { color: "#ffd9a0", radius: 3, direction: 90, angle: 360 },
        });
        sliders()[0].dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(saved).toHaveLength(1);
        expect(get(rgbLampPreviewStore)).toBeUndefined();
    });

    it("shows the colour being picked, and saves it when it is chosen", () => {
        const { saved } = render();
        const input = colour();
        if (!input) throw new Error("no colour input");
        input.value = "#3366ff";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(get(rgbLampPreviewStore)?.settings.color).toBe("#3366ff");
        expect(saved).toHaveLength(0);
        input.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(saved[0]).toMatchObject({ color: "#3366ff", radius: 6 });
    });

    it("follows the handles of the map: the sliders move with a drag, and its release is saved", () => {
        const { saved } = render();
        const [handle] = handles;
        handle.onPreview({ color: "#ffd9a0", radius: 4.5, direction: 200, angle: 80 });
        flushSync();
        expect(sliders().map((slider) => slider.value)).toEqual(["4.5", "80", "200"]);
        expect(handle.settings()).toEqual({ color: "#ffd9a0", radius: 4.5, direction: 200, angle: 80 });
        expect(get(rgbLampPreviewStore)?.settings.radius).toBe(4.5);
        expect(saved).toHaveLength(0);
        handle.onChange({ color: "#ffd9a0", radius: 4.5, direction: 200, angle: 80 });
        flushSync();
        expect(saved[0]).toMatchObject({ radius: 4.5, direction: 200, angle: 80 });
        expect(get(rgbLampPreviewStore)).toBeUndefined();
    });

    it("goes back to the saved settings when a drag is cancelled", () => {
        render();
        const [handle] = handles;
        handle.onPreview({ color: "#ffd9a0", radius: 4, direction: 200, angle: 80 });
        flushSync();
        handle.onPreview({ color: "#ffd9a0", radius: 6, direction: 90, angle: 360 });
        flushSync();
        expect(get(rgbLampPreviewStore)).toBeUndefined();
        expect(sliders().map((slider) => slider.value)).toEqual(["6", "360", "90"]);
    });

    it("saves nothing for someone who cannot edit the lamp, and shows the saved settings again", () => {
        const { saved } = render([], false);
        slide(sliders()[0], "12");
        expect(saved).toHaveLength(0);
        expect(sliders()[0].value).toBe("6");
        expect(get(rgbLampPreviewStore)).toBeUndefined();
    });

    it("removes its handles and its preview when the lamp is no longer selected", async () => {
        render();
        slide(sliders()[0], "3", false);
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        expect(handles[0].destroyed).toBe(true);
        expect(get(rgbLampPreviewStore)).toBeUndefined();
    });
});
