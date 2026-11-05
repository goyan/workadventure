import type { EntityDataProperties, GobeurPropertyData } from "@workadventure/map-editor";
import { deepmergeInto } from "deepmerge-ts";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mock } from "vitest-mock-extended";
import EntityPropertiesEditor from "../../../../src/front/Components/MapEditor/EntityEditor/EntityPropertiesEditor.svelte";
import type { Entity } from "../../../../src/front/Phaser/ECS/Entity";
import { replaceEntityProperty } from "../../../../src/front/Phaser/ECS/EntityProperties";
import { mapEditorSelectedEntityStore } from "../../../../src/front/Stores/MapEditorStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const context = vi.hoisted(() => ({
    remotePlayers: new Map<number, { userUuid: string; playerName: string }>([
        [1, { userUuid: "alice-uuid", playerName: "Alice" }],
        [2, { userUuid: "bob-uuid", playerName: "Bob" }],
    ]),
}));

vi.mock("../../../../src/front/Phaser/Game/GameManager", async () => {
    const { readable } = await import("svelte/store");
    const MapPlayersByKey = Object.assign(context.remotePlayers, {
        subscribe: readable(context.remotePlayers).subscribe,
    });
    const areas = new Map([
        ["prison-area", { id: "prison-area", name: "Prison" }],
        ["safe-area", { id: "safe-area", name: "Safe" }],
    ]);
    const scene = {
        applicationManager: { applications: [] },
        MapPlayersByKey,
        gobeurManager: { launch: vi.fn(), stop: vi.fn() },
        getGameMap: () => ({ getWamFile: () => ({ getGameMapAreas: () => ({ getAreas: () => areas }) }) }),
    };
    return { gameManager: { getCurrentGameScene: () => scene, getPlayerName: () => "Me" } };
});
vi.mock("../../../../src/front/Stores/MapEditorStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        mapEditorSelectedEntityStore: writable(undefined),
        mapEditorSelectedEntityPrefabStore: writable(undefined),
        mapEditorEntityModeStore: writable("EDIT"),
    };
});
vi.mock("../../../../src/front/Stores/MenuStore", async () => {
    const { readable } = await import("svelte/store");
    return { mapEditorActivated: readable(true) };
});
vi.mock("../../../../src/front/Stores/GameSceneStore", async () => {
    const { readable } = await import("svelte/store");
    return { extensionModuleStore: readable([]) };
});
vi.mock("../../../../src/front/Stores/UserInputStore", async () => {
    const { writable } = await import("svelte/store");
    return { inputFormFocusStore: writable(false) };
});
vi.mock("../../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: "local-uuid" }) },
}));
vi.mock("../../../../src/front/Administration/AnalyticsClient", () => ({
    analyticsClient: { trackAdminEvent: vi.fn() },
}));
vi.mock("../../../../src/front/Components/MapEditor/EntityEditor/PlacedImageSizeEditor.svelte", () => ({
    default: vi.fn(),
}));

vi.mock(
    "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte",
    () => ({
        default: vi.fn(),
    }),
);
vi.mock("../../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({
    executeUpdateWAMSettings: vi.fn(),
}));

/** An entity that stores properties like Entity does: updateProperty deep-merges, replaceProperty replaces. */
function fakeEntity(properties: EntityDataProperties): Entity {
    const entity = mock<Entity>();
    Object.defineProperty(entity, "entityId", { value: "entity-1" });
    Object.defineProperty(entity, "visible", { value: true });
    entity.getProperties.mockReturnValue(properties);
    entity.getEntityData.mockReturnValue({
        prefabRef: { id: "prefab", collectionName: "collection" },
        x: 0,
        y: 0,
        name: "",
        depthStep: 0,
        properties,
    });
    entity.getPrefab.mockReturnValue({
        id: "prefab",
        name: "Statue",
        tags: [],
        type: "Default",
        direction: "Down",
        imagePath: "statue.png",
        collectionName: "collection",
        color: "",
    });
    entity.updateProperty.mockImplementation((changes) => {
        const property = properties.find((candidate) => candidate.id === changes.id);
        if (property) deepmergeInto(property, changes);
    });
    entity.replaceProperty.mockImplementation((property) => {
        replaceEntityProperty(properties, property);
    });
    return entity;
}

function stored(properties: EntityDataProperties): GobeurPropertyData {
    const property = properties.find((candidate) => candidate.type === "gobeurPropertyData");
    if (property?.type !== "gobeurPropertyData") throw new Error("No Gobeur property");
    return property;
}

function input(target: HTMLElement, selector: string): HTMLInputElement {
    const element = target.querySelector<HTMLInputElement>(selector);
    if (!element) throw new Error(`No ${selector}`);
    return element;
}

describe("EntityPropertiesEditor with a Gobeur property", () => {
    const previousLocale = get(locale);
    const target = document.createElement("div");
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        document.body.appendChild(target);
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        target.remove();
        setLocale(previousLocale);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
        target.replaceChildren();
        mapEditorSelectedEntityStore.set(undefined);
    });

    it("stores the players and the fallback as edited, without merging them", () => {
        const properties: EntityDataProperties = [
            { id: "description", type: "entityDescriptionProperties", description: "", searchable: false },
            {
                id: "gobeur",
                type: "gobeurPropertyData",
                players: [
                    { uuid: "local-uuid", name: "Me" },
                    { uuid: "alice-uuid", name: "Alice" },
                ],
                prisonAreaId: "prison-area",
                fallbackSafeAreaId: "safe-area",
                level: "beginner",
                durationSeconds: 180,
            },
        ];
        mapEditorSelectedEntityStore.set(fakeEntity(properties));
        component = mount(EntityPropertiesEditor, { target });
        flushSync();

        input(target, "input[data-testid='gobeurPlayer-alice-uuid']").click();
        flushSync();
        const fallback = target.querySelector<HTMLSelectElement>("[data-testid=gobeurFallbackSafe]");
        if (!fallback) throw new Error("No fallback select");
        fallback.value = "";
        fallback.dispatchEvent(new Event("change", { bubbles: true }));
        flushSync();

        expect(stored(properties).players).toEqual([{ uuid: "local-uuid", name: "Me" }]);
        expect("fallbackSafeAreaId" in stored(properties)).toBe(false);
        expect(stored(properties).prisonAreaId).toBe("prison-area");

        input(target, "input[data-testid='gobeurPlayer-bob-uuid']").click();
        flushSync();

        expect(stored(properties).players).toEqual([
            { uuid: "local-uuid", name: "Me" },
            { uuid: "bob-uuid", name: "Bob" },
        ]);
    });
});
