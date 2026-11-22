import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";
import { setLocale } from "../../../../src/i18n/i18n-svelte";

vi.mock("../../../../src/front/Components/ActionBar/ActionBarButton.svelte", async () => ({
    default: (await import("../ActionBar/DeskActionBarButton.svelte")).default,
}));

import FastWaterButton from "../../../../src/front/Components/ActionBar/FastWaterButton.svelte";
import FastWaterChip from "../../../../src/front/Components/ClockLine/FastWaterChip.svelte";
import { fireConditionsStore } from "../../../../src/front/Stores/FireConditionsStore";
import { fastWaterRightsStore, setFastWaterSender } from "../../../../src/front/Stores/FastWaterStore";

const emitSetFastWater = vi.fn();
const rights = (allowed: boolean, mapTimes = 1): void =>
    fastWaterRightsStore.set({ allowed, mapTimes, mapFaster: mapTimes >= 60 });

const conditions = {
    manual: false,
    temperature: 20,
    humidity: 50,
    windSpeed: 0,
    windFrom: 0,
    thresholdTemperature: 30,
    thresholdHumidity: 30,
    thresholdWindSpeed: 30,
};

let target: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const find = (id: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

beforeAll(() => {
    loadLocale("fr-FR");
    setLocale("fr-FR");
    setFastWaterSender(emitSetFastWater);
});

function render(what: typeof FastWaterButton): void {
    target = document.createElement("div");
    document.body.append(target);
    component = mount(what, { target });
    flushSync();
}

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.remove();
    fireConditionsStore.set(undefined);
    rights(false);
    emitSetFastWater.mockReset();
});

describe("the fast water button, next to the basic mode", () => {
    it("is greyed out, with its reason, for whoever may not edit the map", () => {
        rights(false);
        render(FastWaterButton);
        const button = find("fast-water-button");
        expect(button?.dataset.state).toBe("disabled");
        button?.click();
        expect(emitSetFastWater).not.toHaveBeenCalled();
        expect(target.innerHTML).toContain("réservée à qui peut modifier la carte");
    });

    it("turns the fast water of the room on, then off, for whoever may edit the map", () => {
        rights(true);
        render(FastWaterButton);
        find("fast-water-button")?.click();
        expect(emitSetFastWater).toHaveBeenLastCalledWith(true);
        fireConditionsStore.set({ ...conditions, fastWater: 60 });
        flushSync();
        find("fast-water-button")?.click();
        expect(emitSetFastWater).toHaveBeenLastCalledWith(false);
    });

    it("says the map goes fast already, and does nothing then", () => {
        rights(true, 300);
        render(FastWaterButton);
        find("fast-water-button")?.click();
        expect(emitSetFastWater).not.toHaveBeenCalled();
        expect(target.innerHTML).toContain("300 fois plus vite");
    });
});

describe("the fast water chip, on the clock line of everyone", () => {
    it("is shown to everyone while the fast water is on, and only then", () => {
        render(FastWaterChip);
        expect(find("fast-water-chip")).toBeNull();
        fireConditionsStore.set({ ...conditions, fastWater: 60 });
        flushSync();
        expect(find("fast-water-chip")).not.toBeNull();
        expect(target.textContent).toContain("Eau ×60");
        fireConditionsStore.set(conditions);
        flushSync();
        expect(find("fast-water-chip")).toBeNull();
    });

    it("lets whoever may edit the map turn it off from the chip, not the others", () => {
        fireConditionsStore.set({ ...conditions, fastWater: 60 });
        render(FastWaterChip);
        (find("fast-water-chip")?.querySelector("button") ?? find("fast-water-chip"))?.click();
        flushSync();
        expect(find("fast-water-stop")).toBeNull();
        expect(target.textContent).toContain("Seul qui peut modifier la carte");
    });
});
