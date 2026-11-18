import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key and its arguments.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: (_target, _this, args: unknown[]) =>
                [path.join("."), ...args.map((arg) => JSON.stringify(arg))].join(" "),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});
const executeUpdateWAMSettings = vi.fn((_message: unknown) => Promise.resolve());
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings }));

const { default: TerrainLifeSettings } =
    await import("../../../../src/front/Components/MapEditor/TerrainLifeSettings.svelte");
const { aquaticLifeCountsStore } = await import("../../../../src/front/Stores/TerrainEditorStore");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;
const render = (enabled: boolean): void => {
    flushSync(() => {
        component = mount(TerrainLifeSettings, {
            target,
            props: { initial: { enabled, reproductionDelay: 120, maxLifespan: 900, maxSpeed: 1.5, huntInterval: 60 } },
        });
    });
};
const find = (testId: string): HTMLElement | null => target.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const sliders = ["life-reproduction-delay", "life-max-lifespan", "life-max-speed", "life-hunt-interval"];

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    executeUpdateWAMSettings.mockClear();
    aquaticLifeCountsStore.set({ fish: 0, dolphins: 0 });
});

describe("TerrainLifeSettings", () => {
    it("shows only the switch while the life of the map is off", () => {
        render(false);
        expect(find("life-enabled")).not.toBeNull();
        for (const slider of sliders) expect(find(slider)).toBeNull();
        expect(find("life-counts")).toBeNull();
    });

    it("shows its four settings and the animals of the room once it is on", () => {
        aquaticLifeCountsStore.set({ fish: 12, dolphins: 1 });
        render(true);
        for (const slider of sliders) expect(find(slider)).not.toBeNull();
        expect(find("life-counts")?.textContent).toContain('{"fish":12,"dolphins":1}');
    });

    it("saves the five settings to the map when the switch is turned on", () => {
        render(false);
        const input = find("life-enabled")?.querySelector("input");
        if (!input) throw new Error("No switch");
        flushSync(() => input.click());
        expect(executeUpdateWAMSettings).toHaveBeenCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: {
                enabled: true,
                reproductionDelay: 120,
                maxLifespan: 900,
                maxSpeed: 1.5,
                huntInterval: 60,
            },
        });
        for (const slider of sliders) expect(find(slider)).not.toBeNull();
    });

    it("saves a setting moved on its slider", () => {
        render(true);
        const input = find("life-max-speed")?.querySelector<HTMLInputElement>('input[type="range"]');
        if (!input) throw new Error("No slider");
        flushSync(() => {
            input.value = "3";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(executeUpdateWAMSettings).toHaveBeenLastCalledWith({
            $case: "updateLifeSettingMessage",
            updateLifeSettingMessage: expect.objectContaining({ enabled: true, maxSpeed: 3 }),
        });
    });
});
