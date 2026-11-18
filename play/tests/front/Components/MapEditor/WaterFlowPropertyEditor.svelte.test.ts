import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { WaterSinkPropertyData, WaterSourcePropertyData } from "@workadventure/map-editor";

vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: () => path.join("."),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});

const { default: WaterFlowPropertyEditor } =
    await import("../../../../src/front/Components/MapEditor/PropertyEditor/WaterFlowPropertyEditor.svelte");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
// A tree 96 px wide and 160 px high.
const tree = { x: 100, y: 200, displayWidth: 96, displayHeight: 160 };

function render(property: WaterSourcePropertyData | WaterSinkPropertyData, onchange = vi.fn()): typeof onchange {
    flushSync(() => {
        component = mount(WaterFlowPropertyEditor, { target, props: { entity: tree, property, onchange } });
    });
    return onchange;
}

afterEach(async () => {
    localStorage.removeItem("waterFlowUnit");
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
});

describe("WaterFlowPropertyEditor", () => {
    it("names a source and a sink, and shows the flow in cubic metres an hour", () => {
        // 1000 litres a minute: 60 m³ an hour.
        render({ id: "s", type: "waterSourcePropertyData", flow: 1000, anchorX: 48, anchorY: 144 });
        expect(target.textContent).toContain("mapEditor.properties.waterSource.label");
        expect(target.querySelector<HTMLInputElement>('[data-testid="water-flow-value"]')?.value).toBe("60");
        expect(target.textContent).toContain("m³/h");
    });

    it("says what a flow is worth in reality, for a source and for a sink", () => {
        render({ id: "s", type: "waterSourcePropertyData", flow: 1000 });
        expect(target.textContent).toContain("mapEditor.properties.waterSource.real");
    });

    it("names a sink as such", () => {
        render({ id: "k", type: "waterSinkPropertyData", flow: 500, anchorX: 48, anchorY: 144 });
        expect(target.textContent).toContain("mapEditor.properties.waterSink.label");
        expect(target.textContent).toContain("mapEditor.properties.waterSink.flow");
    });

    // Seen in the game: a source on a tree poured nothing, the server reading the corner of its image.
    it("writes the foot of the object in a property that does not have it, and saves it", () => {
        const property: WaterSourcePropertyData = { id: "s", type: "waterSourcePropertyData", flow: 1000 };
        const onchange = render(property);
        expect(onchange).toHaveBeenCalledOnce();
        expect(property).toMatchObject({ anchorX: 48, anchorY: 144 });
    });

    const placed = (flow: number): WaterSourcePropertyData => ({
        id: "s",
        type: "waterSourcePropertyData",
        flow,
        anchorX: 48,
        anchorY: 144,
    });
    const byTestId = <T extends HTMLElement>(id: string): T => {
        const element = target.querySelector<T>(`[data-testid="${id}"]`);
        if (!element) throw new Error(`No element ${id}`);
        return element;
    };
    const type = (value: string): void => {
        const input = byTestId<HTMLInputElement>("water-flow-value");
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
    };

    it("leaves a property that already has its foot, and saves the flow typed as a number in litres a minute", () => {
        const property = placed(1000);
        const onchange = render(property);
        expect(onchange).not.toHaveBeenCalled();
        expect(byTestId<HTMLInputElement>("water-flow-value").value).toBe("60");
        type("600");
        expect(onchange).toHaveBeenCalled();
        // 600 m³ an hour: 10 000 litres a minute.
        expect(property.flow).toBeCloseTo(10000);
    });

    it("goes up and down by steps with its two buttons", () => {
        const property = placed(1000);
        const onchange = render(property);
        byTestId("water-flow-more").click();
        flushSync();
        // 60 m³ an hour, then 70.
        expect(byTestId<HTMLInputElement>("water-flow-value").value).toBe("70");
        expect(property.flow).toBeCloseTo((70 * 1000) / 60);
        byTestId("water-flow-less").click();
        byTestId("water-flow-less").click();
        flushSync();
        expect(byTestId<HTMLInputElement>("water-flow-value").value).toBe("50");
        expect(onchange).toHaveBeenCalledTimes(3);
    });

    it("shows and reads the flow in the unit chosen, without changing the flow, and keeps the choice", () => {
        const property = placed(6000);
        const onchange = render(property);
        const unit = byTestId<HTMLSelectElement>("water-flow-unit");
        expect([...unit.options].map((option) => option.textContent?.trim())).toEqual(["m³/h", "L/s", "L/min", "m³/s"]);
        unit.value = "ls";
        unit.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(byTestId<HTMLInputElement>("water-flow-value").value).toBe("100");
        expect(property.flow).toBe(6000);
        expect(onchange).not.toHaveBeenCalled();
        type("50");
        expect(property.flow).toBeCloseTo(3000);
        expect(localStorage.getItem("waterFlowUnit")).toBe("ls");
    });

    it("has a slider too, which follows the number and sets it", () => {
        const property = placed(1000);
        const onchange = render(property);
        const slider = byTestId("water-flow-slider").querySelector<HTMLInputElement>('input[type="range"]');
        if (!slider) throw new Error("No slider");
        const start = Number(slider.value);
        expect(start).toBeGreaterThan(0);
        type("6000");
        expect(Number(slider.value)).toBeGreaterThan(start);
        slider.value = slider.max;
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        slider.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(property.flow).toBe(2_000_000);
        expect(byTestId<HTMLInputElement>("water-flow-value").value).toBe("120000");
        expect(onchange).toHaveBeenCalled();
    });

    it("sets the radius of a sink in tiles, from a tile and a half when none was set", () => {
        const property: WaterSinkPropertyData = {
            id: "k",
            type: "waterSinkPropertyData",
            flow: 500,
            anchorX: 48,
            anchorY: 144,
        };
        const onchange = render(property);
        const slider = byTestId("water-flow-radius").querySelector<HTMLInputElement>('input[type="range"]');
        if (!slider) throw new Error("No radius slider");
        expect(Number(slider.value)).toBe(1.5);
        expect(Number(slider.max)).toBe(10);
        slider.value = "4";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        flushSync();
        expect(property.radius).toBe(4);
        expect(onchange).toHaveBeenCalled();
    });

    it("sets the radius of a source from nothing: it pours at its foot until one is set", () => {
        render(placed(1000));
        const slider = byTestId("water-flow-radius").querySelector<HTMLInputElement>('input[type="range"]');
        expect(Number(slider?.value)).toBe(0);
    });

    it("never saves more than the largest flow, nor a negative one", () => {
        const property = placed(1000);
        render(property);
        type("999999999");
        expect(property.flow).toBe(2_000_000);
        type("-4");
        expect(property.flow).toBe(0);
    });
});
