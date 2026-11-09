import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import LampPropertyEditor from "../../../src/front/Components/MapEditor/PropertyEditor/LampPropertyEditor.svelte";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const label = (text: string) => () => text;
    return {
        LL: readable({
            mapEditor: {
                properties: {
                    lamp: {
                        label: label("Light zone"),
                        description: label("desc"),
                        width: label("Width"),
                        height: label("Height"),
                        strobeHz: label("Flashes per second"),
                        strobeHzHint: label("hint"),
                    },
                },
            },
        }),
    };
});

describe("LampPropertyEditor", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
    });

    function render(onchange = vi.fn(), onclose = vi.fn(), kind?: string) {
        target = document.createElement("div");
        document.body.appendChild(target);
        const property = { id: "lamp-1", type: "lampPropertyData" as const, width: 12, height: 12, strobeHz: 2 };
        component = mount(LampPropertyEditor, { target, props: { property, kind, onchange, onclose } });
        flushSync();
        return { onchange, onclose, property };
    }
    const sliders = () => [...target.querySelectorAll<HTMLInputElement>('input[type="range"]')];

    it("offers a width and a height, in whole tiles from 2 to 60, starting at the size of the property", () => {
        render();
        const [width, height] = sliders();
        expect(sliders()).toHaveLength(2);
        for (const slider of [width, height]) {
            expect(slider.min).toBe("2");
            expect(slider.max).toBe("60");
            expect(slider.step).toBe("1");
            expect(slider.value).toBe("12");
        }
    });

    it("names what each one sets", () => {
        render();
        expect(target.textContent).toContain("Light zone");
        expect(target.textContent).toContain("Width");
        expect(target.textContent).toContain("Height");
    });

    it("tells the editor when the size changes, so that it is saved", () => {
        const { onchange } = render();
        const [width] = sliders();
        width.value = "20";
        width.dispatchEvent(new Event("input", { bubbles: true }));
        width.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(onchange).toHaveBeenCalled();
    });

    describe("strobe rate", () => {
        it("is offered for a strobe lamp only: no other lamp flashes", () => {
            render(vi.fn(), vi.fn(), "spot");
            expect(sliders()).toHaveLength(2);
            expect(target.querySelector('[data-testid="strobe-presets"]')).toBeNull();
        });

        it("is a slider from half a flash to twelve a second for a strobe lamp", () => {
            render(vi.fn(), vi.fn(), "strobe");
            const rate = sliders()[2];
            expect(sliders()).toHaveLength(3);
            expect(rate.min).toBe("0.5");
            expect(rate.max).toBe("12");
            expect(rate.step).toBe("0.5");
            expect(rate.value).toBe("2");
        });

        it("offers the usual rates of the strobes of a club as shortcuts", () => {
            render(vi.fn(), vi.fn(), "strobe");
            const presets = [...target.querySelectorAll('[data-testid^="strobe-preset-"]')].map((el) =>
                el.textContent?.trim(),
            );
            expect(presets).toEqual(["1 Hz", "2 Hz", "3 Hz", "5 Hz", "8 Hz", "10 Hz", "12 Hz"]);
        });

        it("sets the rate when a shortcut is chosen, and tells the editor so that it is saved", () => {
            const { onchange, property } = render(vi.fn(), vi.fn(), "strobe");
            (target.querySelector('[data-testid="strobe-preset-8"]') as HTMLElement).click();
            flushSync();
            expect(property.strobeHz).toBe(8);
            expect(onchange).toHaveBeenCalled();
        });
    });
});
