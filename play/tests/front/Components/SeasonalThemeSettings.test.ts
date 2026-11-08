import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import SeasonalThemeSettings from "../../../src/front/Components/Menu/SeasonalThemeSettings.svelte";
import { seasonalThemeModeStore } from "../../../src/front/Stores/SeasonalThemeStore";
import { SeasonalThemeMode } from "../../../src/front/Phaser/Game/Seasonal/SeasonalTheme";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const seasonal = {
        label: () => "Seasonal theme",
        auto: () => "Auto",
        autumn: () => "Autumn",
        christmas: () => "Christmas",
        none: () => "None",
        hintAuto: () => "Hint auto",
        hintAutumn: () => "Hint autumn",
        hintChristmas: () => "Hint christmas",
        hintNone: () => "Hint none",
    };
    return { LL: readable({ menu: { settings: { seasonal } } }) };
});

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.replaceChildren();
    seasonalThemeModeStore.set(SeasonalThemeMode.Auto);
});

describe("SeasonalThemeSettings", () => {
    it("shows the four choices and the hint of the selected one", () => {
        document.body.append(target);
        seasonalThemeModeStore.set(SeasonalThemeMode.Auto);
        flushSync(() => {
            component = mount(SeasonalThemeSettings, { target });
        });
        const buttons = [...target.querySelectorAll("button")];
        expect(buttons.map((button) => button.textContent?.trim())).toEqual(["Auto", "Autumn", "Christmas", "None"]);
        expect(target.textContent).toContain("Hint auto");
        flushSync(() => buttons[1].click());
        expect(get(seasonalThemeModeStore)).toBe(SeasonalThemeMode.Autumn);
        expect(target.textContent).toContain("Hint autumn");
    });
});
