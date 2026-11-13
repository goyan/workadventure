import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable } from "svelte/store";
import type { Writable } from "svelte/store";

const canEdit = vi.hoisted(() => ({ store: undefined as unknown as Writable<boolean> }));

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        menu: { settings: { mapWeather: { title: label("Map weather"), description: label("Shared") } } },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    canEdit.store = writable(false);
    return { mapEditorActivated: canEdit.store };
});
// The weather form itself is covered by WeatherSettings.svelte.test.ts.
vi.mock("../../../../src/front/Components/Menu/WeatherSettings.svelte", async () => ({
    default: (await import("./WeatherSettingsStub.svelte")).default,
}));

import MapWeatherSection from "../../../../src/front/Components/Menu/MapWeatherSection.svelte";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLElement;

function render(): void {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = mount(MapWeatherSection, { target });
    flushSync();
}

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target?.remove();
});

describe("MapWeatherSection", () => {
    it("shows the map weather form to people who can edit the map", () => {
        canEdit.store.set(true);
        render();
        const section = target.querySelector('[data-testid="map-weather-settings"]');
        expect(section?.textContent).toContain("Map weather");
        expect(section?.textContent).toContain("Shared");
        expect(target.querySelector('[data-testid="weather-settings-stub"]')).not.toBeNull();
    });

    it("hides the section from people who cannot edit the map", () => {
        canEdit.store.set(false);
        render();
        expect(target.querySelector('[data-testid="map-weather-settings"]')).toBeNull();
    });

    it("appears when the edit right arrives after opening", () => {
        canEdit.store.set(false);
        render();
        canEdit.store.set(true);
        flushSync();
        expect(target.querySelector('[data-testid="map-weather-settings"]')).not.toBeNull();
    });
});
