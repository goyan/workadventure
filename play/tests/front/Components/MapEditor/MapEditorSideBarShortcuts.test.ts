import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import MapEditorSideBar from "../../../../src/front/Components/MapEditor/MapEditorSideBar.svelte";
import { mapEditorActivated } from "../../../../src/front/Stores/MenuStore";

vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({ gameManager: {} }));
vi.mock("../../../../src/front/Administration/AnalyticsClient", () => ({
    analyticsClient: new Proxy({}, { get: () => vi.fn() }),
}));
vi.mock("../../../../src/i18n/i18n-svelte", async (importOriginal) => {
    const { readable } = await import("svelte/store");
    // Any translation renders as its key; the shortcut shows its argument.
    const translations = (path: string[]): unknown =>
        new Proxy(() => undefined, {
            get: (_target, name) => translations([...path, String(name)]),
            apply: (_target, _this, args: unknown[]) =>
                path.at(-1) === "shortcut" ? `Shortcut: ${(args[0] as { key: string }).key}` : path.join("."),
        });
    const LL = readable(translations([]));
    return { ...(await importOriginal<Record<string, unknown>>()), LL, default: LL };
});

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

beforeAll(() => {
    // jsdom has no ResizeObserver; the toolbar only uses it to follow the window width.
    globalThis.ResizeObserver ??= class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    };
});

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted);
    mapEditorActivated.set(false);
});

describe("MapEditorSideBar", () => {
    it("shows the shortcut digit of each tool in its tooltip", () => {
        // Wide window: every tool is listed.
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
        mapEditorActivated.set(true);
        flushSync(() => {
            component = mount(MapEditorSideBar, { target });
        });

        const shortcutOf = (tool: string) =>
            target.querySelector(`[data-testid="mapEditorToolShortcut-${tool}"]`)?.textContent?.trim();
        expect(shortcutOf("ExploreTheRoom")).toBe("· Shortcut: 1");
        expect(shortcutOf("AreaEditor")).toBe("· Shortcut: 2");
        expect(shortcutOf("EntityEditor")).toBe("· Shortcut: 3");
        expect(shortcutOf("WAMSettingsEditor")).toBe("· Shortcut: 4");
        expect(shortcutOf("SelectionEditor")).toBe("· Shortcut: 7");
        expect(shortcutOf("MapLayerEditor")).toBe("· Shortcut: 8");
    });
});
