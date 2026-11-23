import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import ActionBarClocks from "@wa/front/Components/ActionBar/ActionBarClocks.svelte";
import { fastDayOnStore, fastDaySkyStore, fastDaySpeedStore } from "@wa/front/Stores/FastDayStore";
import { basicModeStore } from "@wa/front/Stores/BasicModeStore";
import { mapEditorActivated } from "@wa/front/Stores/MenuStore";
import { mapTimeZoneStore } from "@wa/front/Stores/NightStore";
import { locale, setLocale } from "@wa/i18n/i18n-svelte";
import { loadLocaleAsync } from "@wa/i18n/i18n-util.async";

vi.mock("@wa/front/Phaser/Game/MapEditor/Commands/Facades", () => ({
    executeUpdateWAMSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock("@wa/front/Phaser/Game/GameManager", () => ({ gameManager: { getCurrentGameScene: () => undefined } }));

describe("the day sped up in the action bar", () => {
    const previousLocale = get(locale);
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });
    afterAll(() => setLocale(previousLocale));
    beforeEach(() => {
        fastDayOnStore.set(false);
        fastDaySpeedStore.set(3);
        fastDaySkyStore.set(undefined);
        basicModeStore.set(false);
        mapEditorActivated.set(true);
        mapTimeZoneStore.set("Europe/Paris");
    });
    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        document.body.innerHTML = "";
        basicModeStore.set(false);
        mapEditorActivated.set(false);
        mapTimeZoneStore.set(undefined);
    });

    const render = (): void => {
        component = mount(ActionBarClocks, { target: document.body });
        flushSync();
    };
    const byTestId = (id: string): HTMLElement | null => document.body.querySelector(`[data-testid="${id}"]`);

    it("starts and stops with one button, and sets its speed from one to ten minutes of sky a second", () => {
        render();
        const toggle = byTestId("fast-day-toggle");
        expect(toggle?.getAttribute("aria-pressed")).toBe("false");
        expect(byTestId("fast-day-speed")).toBeNull();
        toggle?.click();
        flushSync();
        expect(get(fastDayOnStore)).toBe(true);
        const slider = byTestId("fast-day-speed") as HTMLInputElement | null;
        expect([slider?.min, slider?.max, slider?.step]).toEqual(["1", "10", "1"]);
        if (slider) {
            slider.value = "7";
            slider.dispatchEvent(new Event("input", { bubbles: true }));
        }
        flushSync();
        expect(get(fastDaySpeedStore)).toBe(7);
        expect(byTestId("fast-day-factor")?.textContent?.trim()).toBe("×7");
        toggle?.click();
        flushSync();
        expect(get(fastDayOnStore)).toBe(false);
    });

    it("shows the time of the sky it sees, at the place of the map", () => {
        fastDayOnStore.set(true);
        fastDaySkyStore.set(new Date("2026-11-12T20:30:00Z"));
        render();
        expect(byTestId("fast-day-sky")?.textContent?.trim()).toBe("21:30");
    });

    it("is hidden in Basique, with the clock of the cold of the map", () => {
        render();
        expect(byTestId("fast-day")).not.toBeNull();
        expect(byTestId("map-clock-freezeThaw")).not.toBeNull();
        basicModeStore.set(true);
        flushSync();
        expect(byTestId("fast-day")).toBeNull();
        expect(byTestId("map-clock-freezeThaw")).toBeNull();
    });
});
