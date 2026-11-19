import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, readable } from "svelte/store";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../../../../src/front/Components/Catastrophe/fireConditionsActions", () => ({ sendFireConditions: send }));
vi.mock("../../../../src/i18n/i18n-svelte", () => {
    // Every label is its own path, with its parameters: enough to read what the tab shows.
    const labels = (path: string): unknown =>
        new Proxy(
            (parameters?: Record<string, unknown>) => (parameters ? `${path}:${JSON.stringify(parameters)}` : path),
            {
                get: (_target, key) => labels(`${path}.${String(key)}`),
            },
        );
    const LL = readable(labels("LL"));
    return { default: LL, LL };
});

import WeatherTab from "../../../../src/front/Components/Catastrophe/WeatherTab.svelte";
import { fireConditionsStore } from "../../../../src/front/Stores/FireConditionsStore";
import { cloudsShownStore } from "../../../../src/front/Stores/WeatherStore";

const thresholds = { thresholdTemperature: 30, thresholdHumidity: 30, thresholdWindSpeed: 30 };
const real = { manual: false, temperature: 22, humidity: 64, windSpeed: 4, windFrom: 90, ...thresholds };

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const render = (): void => {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(WeatherTab, { target });
    flushSync();
};
const slider = (name: string): HTMLInputElement => {
    const found = target.querySelector<HTMLInputElement>(`[data-testid="fire-${name}"]`);
    if (!found) throw new Error(`no ${name}`);
    return found;
};
const drag = (name: string, value: number): void => {
    const input = slider(name);
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
};

beforeEach(() => {
    vi.useFakeTimers();
    send.mockClear();
    fireConditionsStore.set(real);
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    fireConditionsStore.set(undefined);
    vi.useRealTimers();
});

describe("WeatherTab", () => {
    it("shows the real conditions, greyed out, until they are set by hand", () => {
        render();
        expect(slider("temperature").value).toBe("22");
        expect(slider("humidity").value).toBe("64");
        expect(slider("windSpeed").value).toBe("4");
        expect(slider("temperature").disabled).toBe(true);
        expect(slider("manual").checked).toBe(false);
        expect(send).not.toHaveBeenCalled();
    });

    it("asks the server for the conditions set by hand, the eight values at once", () => {
        render();
        slider("manual").click();
        flushSync();
        expect(send).toHaveBeenLastCalledWith({ ...real, manual: true });
        vi.advanceTimersByTime(300);
        drag("temperature", 38);
        expect(send).toHaveBeenLastCalledWith({ ...real, manual: true, temperature: 38 });
    });

    it("follows what the server tells, without sending anything back", () => {
        render();
        fireConditionsStore.set({ ...real, manual: true, temperature: 41, windSpeed: 60 });
        flushSync();
        expect(slider("temperature").value).toBe("41");
        expect(slider("windSpeed").value).toBe("60");
        expect(slider("temperature").disabled).toBe(false);
        vi.advanceTimersByTime(1000);
        expect(send).not.toHaveBeenCalled();
    });

    it("sends a slider being dragged four times a second at most, and always its last value", () => {
        fireConditionsStore.set({ ...real, manual: true });
        render();
        for (let value = 23; value <= 32; value++) drag("temperature", value);
        expect(send).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(250);
        expect(send).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenLastCalledWith({ ...real, manual: true, temperature: 32 });
    });

    it("sets the thresholds without setting the conditions by hand", () => {
        render();
        expect(slider("thresholdHumidity").disabled).toBe(false);
        drag("thresholdHumidity", 45);
        expect(send).toHaveBeenLastCalledWith({ ...real, thresholdHumidity: 45 });
    });

    it("tells the danger as the server computes it", () => {
        fireConditionsStore.set({ ...real, manual: true, temperature: 35, humidity: 10, windSpeed: 40 });
        render();
        const danger = target.querySelector('[data-testid="fire-danger"]');
        expect(danger?.textContent).toContain("dangerLevel.extreme");
        fireConditionsStore.set(real);
        flushSync();
        expect(danger?.textContent).toContain("dangerLevel.low");
    });

    it("says which condition holds the fire back: an air too damp, whatever the heat and the wind", () => {
        fireConditionsStore.set({ ...real, manual: true, temperature: 50, humidity: 96, windSpeed: 120 });
        render();
        expect(target.querySelector('[data-testid="fire-danger"]')?.textContent).toContain("dangerLevel.low");
        const held = target.querySelector('[data-testid="fire-held-back"]');
        expect(held?.textContent).toContain("heldBack.humidity");
        expect(held?.textContent).not.toContain("heldBack.temperature");
        expect(held?.textContent).not.toContain("heldBack.wind");
        expect(slider("humidity").closest("label")?.getAttribute("data-met")).toBe("false");
        expect(slider("temperature").closest("label")?.getAttribute("data-met")).toBe("true");
        expect(slider("windSpeed").closest("label")?.getAttribute("data-met")).toBe("true");
    });

    it("names all that holds the fire back, and nothing once the three conditions are met", () => {
        fireConditionsStore.set({ ...real, manual: true, temperature: 10, humidity: 80, windSpeed: 5 });
        render();
        const held = (): string => target.querySelector('[data-testid="fire-held-back"]')?.textContent ?? "";
        expect(held()).toContain("heldBack.temperature");
        expect(held()).toContain("heldBack.humidity");
        expect(held()).toContain("heldBack.wind");
        fireConditionsStore.set({ ...real, manual: true, temperature: 35, humidity: 10, windSpeed: 40 });
        flushSync();
        expect(target.querySelector('[data-testid="fire-held-back"]')).toBeNull();
    });

    it("hides one's own clouds and their shadows, to see the ground, without asking the server anything", () => {
        cloudsShownStore.set(true);
        render();
        const clouds = target.querySelector<HTMLInputElement>('[data-testid="fire-clouds"]');
        if (!clouds) throw new Error("no clouds switch");
        expect(clouds.checked).toBe(true);
        clouds.click();
        flushSync();
        expect(get(cloudsShownStore)).toBe(false);
        expect(send).not.toHaveBeenCalled();
        cloudsShownStore.set(true);
    });

    it("sets where the wind comes from by the points of the compass", () => {
        fireConditionsStore.set({ ...real, manual: true });
        render();
        const select = target.querySelector<HTMLSelectElement>('[data-testid="fire-windFrom"]');
        if (!select) throw new Error("no wind");
        expect(select.value).toBe("e");
        select.value = "sw";
        select.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();
        expect(send).toHaveBeenLastCalledWith({ ...real, manual: true, windFrom: 225 });
    });
});
