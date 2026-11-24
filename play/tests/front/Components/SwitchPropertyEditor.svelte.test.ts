import type { SwitchPropertyData } from "@workadventure/map-editor";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Entity } from "../../../src/front/Phaser/ECS/Entity";

vi.mock("../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            getSwitches: () => ({ targetsOf: () => [{ id: "l1" }], roomAreaIdOf: () => "room" }),
            getGameMap: () => ({ getWamFile: () => undefined }),
        }),
    },
}));

const { default: SwitchPropertyEditor } =
    await import("../../../src/front/Components/MapEditor/PropertyEditor/SwitchPropertyEditor.svelte");
const { mapEditorSwitchWiringStore } = await import("../../../src/front/Stores/MapEditorStore");
const { locale, setLocale } = await import("../../../src/i18n/i18n-svelte");
const { loadLocaleAsync } = await import("../../../src/i18n/i18n-util.async");

describe("SwitchPropertyEditor", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    const previousLocale = get(locale);

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        setLocale(previousLocale);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        mapEditorSwitchWiringStore.set(undefined);
    });

    function render(property: SwitchPropertyData) {
        const props = $state({
            entity: { entityId: "switch", getElevation: () => 0 } as unknown as Entity,
            property,
        });
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(SwitchPropertyEditor, { target, props });
        flushSync();
        return props;
    }

    it("shows how many lamps the switch commands", () => {
        render({ id: "p", type: "switchPropertyData", key: "on", targets: { mode: "zone" } });
        expect(target.querySelector("[data-testid=switchTargetCount]")?.textContent).toContain("Cibles : 1 lampe");
    });

    it("survives the object being deselected under it: the panel must not break the editor", () => {
        const props = render({ id: "p", type: "switchPropertyData", key: "on", targets: { mode: "ids", ids: [] } });
        mapEditorSwitchWiringStore.set("switch");
        flushSync();

        expect(() => {
            props.entity = undefined as unknown as Entity;
            flushSync();
        }).not.toThrow();
    });

    it("links lamps from one button: the lamps of the room stay as a start, then any lamp can be clicked", () => {
        const props = render({ id: "p", type: "switchPropertyData", key: "on", targets: { mode: "zone" } });
        const link = target.querySelector<HTMLButtonElement>("[data-testid=switchPickTargets]");
        expect(link?.textContent).toContain("Lier des lampes");

        link?.click();
        flushSync();

        expect(props.property.targets).toEqual({ mode: "ids", ids: ["l1"] });
        expect(get(mapEditorSwitchWiringStore)).toBe("switch");
        expect(target.querySelector("[data-testid=switchPickTargets]")?.textContent).toContain("Terminer");

        target.querySelector<HTMLButtonElement>("[data-testid=switchPickTargets]")?.click();
        flushSync();
        expect(get(mapEditorSwitchWiringStore)).toBeUndefined();
    });

    it("stops wiring when it is closed", async () => {
        render({ id: "p", type: "switchPropertyData", key: "on", targets: { mode: "ids", ids: [] } });
        mapEditorSwitchWiringStore.set("switch");
        flushSync();
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        expect(get(mapEditorSwitchWiringStore)).toBeUndefined();
    });
});
