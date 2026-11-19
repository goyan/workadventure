import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount, tick } from "svelte";
import { get } from "svelte/store";
import FloorLevelPicker from "../../../../src/front/Components/MapEditor/FloorLevelPicker.svelte";
import { mapEditorPlacementLevelStore } from "../../../../src/front/Stores/MapEditorStore";
import { floorLevelViewedStore } from "../../../../src/front/Stores/FloorLevelsStore";
import {
    mapLayerBuiltLevelsStore,
    mapLayerLevelsStore,
    mapLayerPickLevelStore,
} from "../../../../src/front/Stores/MapLayerStore";
import { setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocale } from "../../../../src/i18n/i18n-util.sync";

let component: ReturnType<typeof mount> | undefined;
const target = document.createElement("div");
beforeEach(() => {
    loadLocale("fr-FR");
    setLocale("fr-FR");
    mapLayerBuiltLevelsStore.set([52, 116]);
    mapLayerLevelsStore.set([52, 84, 116]);
    mapEditorPlacementLevelStore.set(52);
    floorLevelViewedStore.set(undefined);
    document.body.append(target);
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    target.replaceChildren();
    target.remove();
    mapLayerBuiltLevelsStore.set([]);
    mapLayerLevelsStore.set([]);
    mapEditorPlacementLevelStore.set("auto");
    mapLayerPickLevelStore.set(false);
});

async function openMenu(): Promise<void> {
    target.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.click();
    await tick();
}

describe("construction floor picker", () => {
    it("uses the game menu, changes the build level and closes after choosing", async () => {
        flushSync(() => {
            component = mount(FloorLevelPicker, { target });
        });
        expect(target.querySelector("select")).toBeNull();
        await openMenu();
        const option = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find((button) =>
            button.textContent?.includes("Niveau 4"),
        );
        expect(option).toBeDefined();
        flushSync(() => option?.click());
        expect(get(mapEditorPlacementLevelStore)).toBe(116);
        expect(get(floorLevelViewedStore)).toBeUndefined();
        expect(target.querySelector('[role="menu"]')).toBeNull();
        expect(target.querySelector('[aria-haspopup="menu"]')?.textContent).toContain("Niveau 4");
    });
    it("moves a selected object without changing the working floor or offering auto", async () => {
        const move = vi.fn();
        flushSync(() => {
            component = mount(FloorLevelPicker, { target, props: { objectLevel: 52, onObjectLevel: move } });
        });
        await openMenu();
        const options = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
        expect(options.some((button) => button.textContent?.includes("Auto"))).toBe(false);
        flushSync(() => options.find((button) => button.textContent?.includes("Niveau 4"))?.click());
        expect(move).toHaveBeenCalledWith(116);
        expect(get(mapEditorPlacementLevelStore)).toBe(52);
    });
});
