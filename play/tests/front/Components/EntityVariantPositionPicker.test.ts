import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { EntityPrefab } from "@workadventure/map-editor";
import EntityVariantPositionPicker from "../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityVariantPositionPicker.svelte";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    return {
        LL: readable({
            mapEditor: {
                entityEditor: {
                    views: {
                        label: () => "View",
                        front: () => "Front",
                        back: () => "Back",
                        left: () => "Left",
                        right: () => "Right",
                    },
                },
            },
        }),
    };
});

const prefab = (id: string, direction: "Left" | "Right" | "Up" | "Down") =>
    ({ id, name: "treadmill", imagePath: `${id}.png`, direction, tags: [], type: "Custom" }) as unknown as EntityPrefab;

// The image of a view measures itself; jsdom has no ResizeObserver.
vi.stubGlobal(
    "ResizeObserver",
    class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    },
);

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.innerHTML = "";
});

describe("EntityVariantPositionPicker", () => {
    it("shows one named button per view, marks the selected one, and picks on click", () => {
        const right = prefab("r", "Right");
        const left = prefab("l", "Left");
        const onPickItem = vi.fn();
        flushSync(() => {
            component = mount(EntityVariantPositionPicker, {
                target,
                props: { entityPrefabsPositions: [right, left], selectedEntity: right, onPickItem },
            });
        });
        const buttons = [...target.querySelectorAll("button")];
        expect(buttons.map((button) => button.textContent?.trim())).toEqual(["Right", "Left"]);
        expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
        expect(target.textContent).toContain("View");
        flushSync(() => buttons[1].click());
        expect(onPickItem).toHaveBeenCalledWith(left);
    });

    it("shows nothing for an object with a single view", () => {
        flushSync(() => {
            component = mount(EntityVariantPositionPicker, {
                target,
                props: {
                    entityPrefabsPositions: [prefab("r", "Right")],
                    selectedEntity: prefab("r", "Right"),
                    onPickItem: vi.fn(),
                },
            });
        });
        expect(target.querySelectorAll("button")).toHaveLength(0);
    });
});
