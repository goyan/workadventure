import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({
    executeUpdateWAMSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../../../src/front/Phaser/Game/Terrain/TerrainMapSettings", () => ({
    readTerrainMapSettings: () => ({
        life: {
            enabled: true,
            reproductionDelay: 120,
            maxLifespan: 900,
            maxSpeed: 1.5,
            huntInterval: 60,
            drinkInterval: 120,
        },
    }),
}));
vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: () => path.join("."),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});

const { default: LifeEditor } = await import("../../../../src/front/Components/MapEditor/LifeEditor.svelte");

const target = document.body.appendChild(document.createElement("div"));
let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
});

describe("LifeEditor", () => {
    it("holds the dashboard and the settings of the life, and scrolls when it is taller than its room", () => {
        flushSync(() => {
            component = mount(LifeEditor, { target });
        });
        const panel = target.querySelector<HTMLElement>('[data-testid="life-editor"]');
        if (!panel) throw new Error("No panel");
        expect(panel.classList.contains("overflow-y-auto")).toBe(true);
        expect(panel.classList.contains("min-h-0")).toBe(true);
        expect(panel.classList.contains("flex-1")).toBe(true);
        expect(panel.querySelector('[data-testid="life-dashboard-empty"]')).not.toBeNull();
        expect(panel.querySelector('[data-testid="life-enabled"]')).not.toBeNull();
    });
});
