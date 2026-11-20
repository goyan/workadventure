import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { readable } from "svelte/store";
import type { Writable } from "svelte/store";

const canEdit = vi.hoisted(() => ({ store: undefined as unknown as Writable<boolean> }));
const executeUpdateWAMSettings = vi.hoisted(() => vi.fn());
const wamSettings = vi.hoisted((): { value: { lighting?: { energySaving: boolean } } } => ({ value: {} }));

vi.mock("../../../../src/i18n/i18n-svelte", () => {
    const label = (text: string) => () => text;
    const LL = readable({
        menu: {
            settings: {
                mapLighting: {
                    title: label("Map lighting"),
                    energySaving: label("Energy saving"),
                    energySavingHint: label("Outdoor lamps go out by day"),
                },
            },
        },
    });
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    canEdit.store = writable(false);
    return { mapEditorActivated: canEdit.store };
});
const getGameMap = vi.hoisted(() => vi.fn());
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: () => ({ getGameMap }) },
}));
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));

import MapLightingSection from "../../../../src/front/Components/Menu/MapLightingSection.svelte";

let component: ReturnType<typeof mount> | undefined;
let target: HTMLElement;

function render(): void {
    target = document.createElement("div");
    document.body.appendChild(target);
    component = mount(MapLightingSection, { target });
    flushSync();
}

const toggle = (): HTMLInputElement | null =>
    target.querySelector<HTMLInputElement>('[data-testid="map-energy-saving"] input[type="checkbox"]');

beforeEach(() => {
    executeUpdateWAMSettings.mockReset();
    executeUpdateWAMSettings.mockResolvedValue(undefined);
    wamSettings.value = {};
    getGameMap.mockReset();
    getGameMap.mockImplementation(() => ({
        getWamFile: () => ({ getWam: () => ({ settings: wamSettings.value }) }),
    }));
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target?.remove();
});

describe("MapLightingSection", () => {
    it("hides the section from people who cannot edit the map", () => {
        canEdit.store.set(false);
        render();
        expect(target.querySelector('[data-testid="map-lighting-settings"]')).toBeNull();
        // The map is not even read for them.
        expect(getGameMap).not.toHaveBeenCalled();
    });

    it("shows the energy saving off on a map that never set it, with its hint", () => {
        canEdit.store.set(true);
        render();
        const section = target.querySelector('[data-testid="map-lighting-settings"]');
        expect(section?.textContent).toContain("Energy saving");
        expect(section?.textContent).toContain("Outdoor lamps go out by day");
        expect(toggle()?.checked).toBe(false);
    });

    it("shows the energy saving the map set", () => {
        wamSettings.value = { lighting: { energySaving: true } };
        canEdit.store.set(true);
        render();
        expect(toggle()?.checked).toBe(true);
    });

    it("saves it for the whole map as soon as it is switched", () => {
        canEdit.store.set(true);
        render();
        toggle()?.click();
        flushSync();
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateLightingSettingMessage",
            updateLightingSettingMessage: { energySaving: true },
        });
    });
});
