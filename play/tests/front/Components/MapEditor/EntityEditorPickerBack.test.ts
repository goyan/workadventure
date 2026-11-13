import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { mock } from "vitest-mock-extended";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import {
    mapEditorEntityModeStore,
    mapEditorSelectedEntityStore,
    selectCategoryStore,
} from "../../../../src/front/Stores/MapEditorStore";

vi.mock("../../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    // Every label is a function giving its own path: the texts are not looked at here.
    const labels = (path: string): unknown =>
        new Proxy(() => path, { get: (_target, key) => labels(`${path}.${String(key)}`) });
    const LL = readable(labels("LL"));
    return { LL, default: LL };
});
vi.mock("../../../../src/front/Phaser/Game/GameManager", async () => {
    const { writable } = await import("svelte/store");
    return {
        gameManager: {
            getCurrentGameScene: () => ({
                getEntitiesCollectionsManager: () => ({ getEntitiesPrefabsVariantStore: () => writable([]) }),
                getGameMap: () => ({ getWamFile: () => undefined }),
                connection: { userCanEdit: true },
            }),
        },
    };
});
const stub = vi.hoisted(() => async () => ({
    default: ((await import("./ChildStub.svelte")) as { default: unknown }).default,
}));
vi.mock("../../../../src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte", stub);
vi.mock("../../../../src/front/Components/MapEditor/EntityEditor/CategoryManager.svelte", stub);
vi.mock("../../../../src/front/Components/MapEditor/EntityEditor/CategoryTile.svelte", stub);
vi.mock("../../../../src/front/Components/MapEditor/EntityEditor/EntitiesGrid.svelte", stub);
vi.mock(
    "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte",
    stub,
);

const { default: EntityEditorPicker } =
    await import("../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte");

const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
    const mounted = component;
    component = undefined;
    if (mounted) await unmount(mounted, { outro: false });
    target.innerHTML = "";
    mapEditorSelectedEntityStore.set(undefined);
    mapEditorEntityModeStore.set("ADD");
    selectCategoryStore.set(undefined);
});

describe("Back button of the object library", () => {
    it("leaves an object still selected on the map", () => {
        // A file dropped on the map while an object is selected shows the library with that object still selected.
        const selected = mock<Entity>({ entityId: "chair" });
        mapEditorSelectedEntityStore.set(selected);
        selectCategoryStore.set({ kind: "tag", tag: "Chairs" });
        flushSync(() => {
            component = mount(EntityEditorPicker, { target });
        });

        target.querySelector<HTMLButtonElement>("[data-testid=clearCurrentSelection]")?.click();
        flushSync();

        expect(selected.delete.mock.calls).toHaveLength(0);
        expect(get(mapEditorSelectedEntityStore)).toBeUndefined();
        expect(get(selectCategoryStore)).toBeUndefined();
    });
});
