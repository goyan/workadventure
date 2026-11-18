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
                    colorCode: label("Colour code"),
                    temperatures: label("Colour temperature"),
                    warmWhite: label("warm white"),
                    neutralWhite: label("neutral white"),
                    coolWhite: label("cool white"),
                    daylight: label("daylight"),
                    colorCodeInvalid: label("Expected: #rrggbb or #rgb"),
                    copyColor: label("Copy the colour code"),
                    copy: label("Copy"),
                    copied: label("Copied"),
                    radius: label("Reach"),
                    angle: label("Opening"),
                    direction: label("Direction"),
                    intensity: label("Intensity"),
                    power: label("Power"),
                    powerPresets: {
                        candle: label("Candle"),
                        accent: label("Accent"),
                        desk: label("Desk"),
                        bulb: label("Bulb"),
                        ceiling: label("Ceiling"),
                        floodlight: label("Floodlight"),
                    },
                    powerHint: label("follows the power"),
                    powerFree: label("free setting hint"),
                    freeSetting: label("Free setting"),
                    rotation: label("Turn like a rotating beacon"),
                    rotationSpeed: label("Speed"),
                    rotationSpeedUnit: label("rpm"),
                    rotationSense: label("Sense"),
                    rotationClockwise: label("Clockwise"),
                    rotationCounterclockwise: label("Counterclockwise"),
                    rotationHint: label("rotation hint"),
                    rotationFullCircle: label("full circle hint"),
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
    // The five settings of the lamp, in this order whatever their place in the panel; the power has its own slider.
    const sliders = () =>
        ["radius", "angle", "direction", "intensity", "rotation-speed"].flatMap((name) => {
            const slider = target.querySelector<HTMLInputElement>(`#rgb-lamp-${name}-lamp-1`);
            return slider ? [slider] : [];
        });
    const power = () => target.querySelector<HTMLInputElement>("#rgb-lamp-power-lamp-1");
    const preset = (name: string) =>
        [...target.querySelectorAll<HTMLButtonElement>('[data-testid="rgb-lamp-power"] button')].find(
            (button) => button.textContent?.trim() === name,
        );
    const colour = () => target.querySelector<HTMLInputElement>('input[type="color"]');
    function slide(slider: HTMLInputElement, value: string, release = true): void {
        slider.value = value;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        if (release) slider.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
    }

    describe("power", () => {
        it("reads the lamp of today as a bulb of about 600 lm, and says its reach and strength follow", () => {
            render();
            expect(Number(power()?.value)).toBeGreaterThan(580);
            expect(Number(power()?.value)).toBeLessThan(620);
            // Stronger than an ordinary bulb (450 lm): none of the named lamps.
            expect(preset("Bulb")?.getAttribute("aria-pressed")).toBe("false");
            expect(target.textContent).toContain("follows the power");
        });

        it("sets an ordinary bulb of 450 lm: 5 tiles, three quarters of the full strength", () => {
            const { saved } = render();
            preset("Bulb")?.click();
            flushSync();

            expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", radius: 5, intensity: 0.75 });
            expect(preset("Bulb")?.getAttribute("aria-pressed")).toBe("true");
            expect(preset("Bulb")?.getAttribute("title")).toBe("450 lm");
        });

        it("sets the reach and the strength together when a real lamp is chosen, as one step saved", () => {
            const { saved } = render();
            preset("Desk")?.click();
            flushSync();

            expect(saved).toHaveLength(1);
            expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", radius: 4.5, intensity: 0.6 });
            expect(sliders()[0].value).toBe("4.5");
            expect(sliders()[3].value).toBe("60");
        });

        it("shows the power being dragged on the map, and saves it when the slider is released", () => {
            const { saved } = render();
            const slider = power();
            if (!slider) throw new Error("no power slider");
            slide(slider, "1600", false);
            expect(saved).toHaveLength(0);
            expect(get(rgbLampPreviewStore)?.settings).toMatchObject({ radius: 10 });
            slider.dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
            expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", radius: 10 });
            expect(saved[0]).not.toHaveProperty("intensity");
        });

        it("says so for a lamp set freely, to a reach and a strength no real lamp has", () => {
            render([
                {
                    id: "p",
                    type: "rgbLampPropertyData",
                    color: "#ffffff",
                    radius: 10,
                    direction: 90,
                    angle: 360,
                    intensity: 0.3,
                },
            ]);
            expect(target.textContent).toContain("free setting hint");
            expect(sliders()[0].value).toBe("10");
            expect(sliders()[3].value).toBe("30");
        });
    });

    it("shows the defaults of a lamp nothing was set on: warm white, 6 tiles, all around, downwards", () => {
        render();
        expect(colour()?.value).toBe("#ffd9a0");
        const [radius, angle, direction, intensity] = sliders();
        // The speed of the rotation comes last.
        expect(sliders()).toHaveLength(5);
        expect([radius.min, radius.max, radius.value]).toEqual(["1", "20", "6"]);
        expect([angle.min, angle.max, angle.value]).toEqual(["10", "360", "360"]);
        expect([direction.min, direction.max, direction.value]).toEqual(["0", "359", "90"]);
        expect([intensity.min, intensity.max, intensity.step, intensity.value]).toEqual(["10", "100", "5", "100"]);
    });

    it("shows what was set on the lamp", () => {
        render([{ id: "p", type: "rgbLampPropertyData", color: "#00ff00", radius: 10, direction: 180, angle: 45 }]);
        expect(colour()?.value).toBe("#00ff00");
        expect(sliders().map((slider) => slider.value)).toEqual(["10", "45", "180", "100", "30"]);
    });

    it("names what each control sets", () => {
        render();
        for (const text of ["Light of the lamp", "Colour", "Reach", "Opening", "Direction", "Intensity"]) {
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
        expect(sliders().map((slider) => slider.value)).toEqual(["4.5", "80", "200", "100", "30"]);
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
        expect(sliders().map((slider) => slider.value)).toEqual(["6", "360", "90", "100", "30"]);
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

    describe("intensity", () => {
        const intensity = () => sliders()[3];

        it("shows the intensity that was set, in percent", () => {
            render([
                {
                    id: "p",
                    type: "rgbLampPropertyData",
                    color: "#00ff00",
                    radius: 10,
                    direction: 180,
                    angle: 45,
                    intensity: 0.4,
                },
            ]);
            expect(intensity().value).toBe("40");
        });

        it("shows an intensity being dragged on the map, and saves it when the slider is released", () => {
            const { saved } = render();
            slide(intensity(), "55", false);
            expect(saved).toHaveLength(0);
            expect(get(rgbLampPreviewStore)?.settings).toMatchObject({ intensity: 0.55, radius: 6 });
            intensity().dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
            expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", intensity: 0.55, radius: 6 });
        });

        it("writes no intensity on a lamp at full strength, as on a lamp that never had one", () => {
            const { saved } = render([
                {
                    id: "p",
                    type: "rgbLampPropertyData",
                    color: "#00ff00",
                    radius: 10,
                    direction: 180,
                    angle: 45,
                    intensity: 0.4,
                },
            ]);
            slide(intensity(), "100");
            expect(saved.at(-1)).not.toHaveProperty("intensity");
            slide(sliders()[0], "12");
            expect(saved.at(-1)).not.toHaveProperty("intensity");
        });
    });

    describe("colour temperature presets", () => {
        // CIE 1964 10° rows of Mitchell Charity's blackbody table (sRGB), read on 2026-11-14:
        // http://www.vendian.org/mncharity/dir3/blackbody/UnstableURLs/bbr_color.txt (version 2001-Jun-22).
        const sourced = [
            ["2700 K", "#ffa957"],
            ["3000 K", "#ffb46b"],
            ["4000 K", "#ffd1a3"],
            ["5000 K", "#ffe4ce"],
            ["6500 K", "#fff9fd"],
        ];
        const presets = () =>
            [...target.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
                / K$/.test(button.textContent?.trim() ?? ""),
            );
        const preset = (kelvin: string) => {
            const button = presets().find((candidate) => candidate.textContent?.trim() === kelvin);
            if (!button) throw new Error(`no ${kelvin} button`);
            return button;
        };

        it("offers five bulb temperatures, named", () => {
            render();
            expect(presets().map((button) => button.textContent?.trim())).toEqual(sourced.map(([kelvin]) => kelvin));
            expect(preset("2700 K").getAttribute("aria-label")).toBe("2700 K, warm white");
            expect(preset("4000 K").getAttribute("aria-label")).toBe("4000 K, neutral white");
            expect(preset("6500 K").getAttribute("aria-label")).toBe("6500 K, daylight");
            expect(preset("2700 K").title).toBe("2700 K, warm white");
            expect(target.textContent).toContain("Colour temperature");
        });

        it.each(sourced)(
            "applies the colour of the blackbody at %s (%s), saved like a code that is entered",
            (kelvin, colour) => {
                const { saved } = render();
                preset(kelvin).click();
                flushSync();
                expect(saved).toHaveLength(1);
                expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", color: colour, radius: 6 });
                expect(target.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe(colour);
                expect(get(rgbLampPreviewStore)).toBeUndefined();
            },
        );

        it("shows the preset of the current colour as pressed, and none for another colour", () => {
            render([{ id: "p", type: "rgbLampPropertyData", color: "#FFD1A3", radius: 6, direction: 90, angle: 360 }]);
            expect(presets().map((button) => button.getAttribute("aria-pressed"))).toEqual([
                "false",
                "false",
                "true",
                "false",
                "false",
            ]);
            preset("6500 K").click();
            flushSync();
            expect(preset("6500 K").getAttribute("aria-pressed")).toBe("true");
            expect(preset("4000 K").getAttribute("aria-pressed")).toBe("false");
            const picker = colour();
            if (!picker) throw new Error("no colour input");
            picker.value = "#123456";
            picker.dispatchEvent(new Event("input", { bubbles: true }));
            flushSync();
            expect(presets().every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
        });

        it("saves nothing for someone who cannot edit the lamp", () => {
            const { saved } = render([], false);
            preset("2700 K").click();
            flushSync();
            expect(saved).toHaveLength(0);
            expect(colour()?.value).toBe("#ffd9a0");
        });
    });

    describe("colour code", () => {
        const code = () => {
            const input = target.querySelector<HTMLInputElement>('input[type="text"]');
            if (!input) throw new Error("no colour code field");
            return input;
        };
        const copyButton = () => {
            const button = target.querySelector<HTMLButtonElement>('button[aria-label="Copy the colour code"]');
            if (!button) throw new Error("no copy button");
            return button;
        };
        function type(text: string): void {
            const input = code();
            input.value = text;
            input.dispatchEvent(new Event("input", { bubbles: true }));
            flushSync();
        }
        function commit(): void {
            code().dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
        }
        function leave(): void {
            code().blur();
            flushSync();
        }
        const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
        function clipboard(writeText: (text: string) => Promise<void>) {
            const spy = vi.fn(writeText);
            Object.defineProperty(navigator, "clipboard", { value: { writeText: spy }, configurable: true });
            return spy;
        }
        afterEach(() => {
            if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
            else Reflect.deleteProperty(navigator, "clipboard");
            vi.useRealTimers();
        });

        it("shows the colour of the lamp as a lowercase #rrggbb code, named", () => {
            render([{ id: "p", type: "rgbLampPropertyData", color: "#E0A93A", radius: 6, direction: 90, angle: 360 }]);
            expect(code().value).toBe("#e0a93a");
            expect(code().getAttribute("aria-invalid")).not.toBe("true");
            expect(target.textContent).toContain("Colour code");
        });

        it("shows a code being typed on the map, and saves it like the picker when it is entered", () => {
            const { saved } = render();
            code().focus();
            type("E0A93A");
            expect(get(rgbLampPreviewStore)?.settings.color).toBe("#e0a93a");
            expect(colour()?.value).toBe("#e0a93a");
            expect(saved).toHaveLength(0);
            commit();
            expect(saved).toHaveLength(1);
            expect(saved[0]).toMatchObject({ type: "rgbLampPropertyData", color: "#e0a93a", radius: 6 });
            expect(get(rgbLampPreviewStore)).toBeUndefined();
            expect(code().value).toBe("#e0a93a");
        });

        it("reads a short #rgb code", () => {
            const { saved } = render();
            code().focus();
            type("#abc");
            commit();
            expect(saved[0]).toMatchObject({ color: "#aabbcc" });
            expect(code().value).toBe("#aabbcc");
        });

        it("does not apply an invalid code, says so, and shows the colour of the lamp again when the field is left", () => {
            const { saved } = render();
            code().focus();
            type("#abc");
            type("#abcx");
            expect(code().getAttribute("aria-invalid")).toBe("true");
            expect(target.textContent).toContain("Expected: #rrggbb or #rgb");
            // The colour previewed by the valid start of the code is taken back: the lamp keeps its colour.
            expect(get(rgbLampPreviewStore)).toBeUndefined();
            commit();
            expect(saved).toHaveLength(0);
            expect(code().value).toBe("#abcx");
            leave();
            expect(code().value).toBe("#ffd9a0");
            expect(code().getAttribute("aria-invalid")).not.toBe("true");
            expect(target.textContent).not.toContain("Expected: #rrggbb or #rgb");
        });

        it("follows the picker and the handles of the map", () => {
            render();
            const picker = colour();
            if (!picker) throw new Error("no colour input");
            picker.value = "#3366ff";
            picker.dispatchEvent(new Event("input", { bubbles: true }));
            flushSync();
            expect(code().value).toBe("#3366ff");
            handles[0].onPreview({ color: "#00ff00", radius: 6, direction: 90, angle: 360 });
            flushSync();
            expect(code().value).toBe("#00ff00");
        });

        it("saves nothing typed by someone who cannot edit the lamp", () => {
            const { saved } = render([], false);
            code().focus();
            type("#123456");
            commit();
            leave();
            expect(saved).toHaveLength(0);
            expect(code().value).toBe("#ffd9a0");
        });

        it("copies the code, and says so for a moment", async () => {
            vi.useFakeTimers();
            const writeText = clipboard(() => Promise.resolve());
            render([{ id: "p", type: "rgbLampPropertyData", color: "#E0A93A", radius: 6, direction: 90, angle: 360 }]);
            expect(copyButton().textContent?.trim()).toBe("Copy");
            copyButton().click();
            await vi.advanceTimersByTimeAsync(0);
            flushSync();
            expect(writeText).toHaveBeenCalledWith("#e0a93a");
            expect(copyButton().textContent?.trim()).toBe("Copied");
            await vi.advanceTimersByTimeAsync(2000);
            flushSync();
            expect(copyButton().textContent?.trim()).toBe("Copy");
        });

        it("selects the code to copy by hand when the clipboard is refused", async () => {
            clipboard(() => Promise.reject(new Error("refused")));
            const { saved } = render();
            copyButton().click();
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
            flushSync();
            expect([code().selectionStart, code().selectionEnd]).toEqual([0, "#ffd9a0".length]);
            expect(copyButton().textContent?.trim()).toBe("Copy");
            expect(saved).toHaveLength(0);
        });
    });

    describe("rotation", () => {
        const set = (overrides: Record<string, unknown> = {}): EntityDataProperties => [
            {
                id: "p",
                type: "rgbLampPropertyData",
                color: "#00ff00",
                radius: 10,
                direction: 180,
                angle: 45,
                ...overrides,
            },
        ];
        const rotationSwitch = () => target.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const radios = () => [...target.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
        const speed = () => sliders()[4];
        function click(input: HTMLInputElement | null | undefined): void {
            if (!input) throw new Error("no input");
            input.click();
            flushSync();
        }

        it("shows a still lamp: rotation off, 30 turns a minute and clockwise ready, greyed until it turns", () => {
            render(set());
            expect(rotationSwitch()?.checked).toBe(false);
            expect([speed().min, speed().max, speed().value]).toEqual(["10", "120", "30"]);
            expect(radios().map((radio) => radio.checked)).toEqual([true, false]);
            expect(speed().disabled || speed().closest("fieldset:disabled") !== null).toBe(true);
            for (const text of ["Turn like a rotating beacon", "Speed", "rpm", "Clockwise", "Counterclockwise"]) {
                expect(target.textContent).toContain(text);
            }
        });

        it("turns the lamp on with the switch and saves it, with its speed and its sense", () => {
            const { saved } = render(set());
            click(rotationSwitch());
            expect(saved.at(-1)).toMatchObject({
                id: "p",
                rotation: true,
                rotationSpeed: 30,
                rotationClockwise: true,
                direction: 180,
            });
            expect(speed().closest("fieldset:disabled")).toBeNull();
            expect(target.textContent).toContain("rotation hint");
        });

        it("saves the speed when its slider is released, and the sense when it is chosen", () => {
            const { saved } = render(set({ rotation: true }));
            slide(speed(), "120");
            expect(saved.at(-1)).toMatchObject({ rotation: true, rotationSpeed: 120 });
            click(radios()[1]);
            expect(saved.at(-1)).toMatchObject({ rotation: true, rotationSpeed: 120, rotationClockwise: false });
        });

        it("shows what was set on a turning lamp", () => {
            render(set({ rotation: true, rotationSpeed: 75, rotationClockwise: false }));
            expect(rotationSwitch()?.checked).toBe(true);
            expect(speed().value).toBe("75");
            expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
        });

        it("keeps the speed and the sense when the rotation is turned off, and the lamp then stands still", () => {
            const { saved } = render(set({ rotation: true, rotationSpeed: 75, rotationClockwise: false }));
            click(rotationSwitch());
            expect(saved.at(-1)).toMatchObject({ rotation: false, rotationSpeed: 75, rotationClockwise: false });
        });

        it("writes nothing about the rotation on a lamp that never turned", () => {
            const { saved } = render();
            slide(sliders()[0], "12");
            expect(saved[0]).not.toHaveProperty("rotation");
            expect(saved[0]).not.toHaveProperty("rotationSpeed");
            expect(saved[0]).not.toHaveProperty("rotationClockwise");
        });

        it("greys the rotation out on a lamp that shines all around, where turning shows nothing, and says why", () => {
            render(set({ angle: 360, rotation: true }));
            expect(rotationSwitch()?.disabled || rotationSwitch()?.closest("fieldset:disabled") !== null).toBe(true);
            expect(speed().closest("fieldset:disabled")).not.toBeNull();
            expect(target.textContent).toContain("full circle hint");
        });

        it("shows a speed being dragged on the map before it is released", () => {
            const { saved } = render(set({ rotation: true }));
            slide(speed(), "60", false);
            expect(saved).toHaveLength(0);
            expect(get(rgbLampPreviewStore)?.settings).toMatchObject({ rotation: true, rotationSpeed: 60 });
        });
    });
});
