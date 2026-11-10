import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import type { Writable } from "svelte/store";
import { personalAreaDataStore } from "../../../src/front/Stores/PersonalDeskStore";
import MapSubMenuContent from "../../../src/front/Components/ActionBar/MenuIcons/MapSubMenuContent.svelte";
import UnclaimPersonalDeskModal from "../../../src/front/Components/ActionBar/MenuIcons/UnclaimPersonalDeskModal.svelte";
import {
    globalMessageVisibleStore,
    mapEditorActivated,
    mapEditorMenuVisibleStore,
    mapManagerActivated,
} from "../../../src/front/Stores/MenuStore";

const mocks = vi.hoisted(() => ({
    open: vi.fn(),
    close: vi.fn(),
    release: vi.fn(),
    warning: vi.fn(),
    uuid: "human",
    scene: {},
    desk: { id: "desk-one", name: "Desk One", properties: [{ type: "personalAreaPropertyData", ownerId: "human" }] },
}));
vi.mock("@wa-modals", () => ({ modals: { stack: [], open: mocks.open, close: mocks.close } }));
vi.mock("../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getLocalUser: () => ({ uuid: mocks.uuid }), getDisableNight: () => false },
}));
vi.mock("../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: { getCurrentGameScene: () => mocks.scene },
}));
vi.mock("../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager", () => ({ EditorToolName: {} }));
vi.mock("../../../src/front/Phaser/Game/MapEditor/Commands/Facades", () => ({ executeUpdateWAMSettings: vi.fn() }));
vi.mock("../../../src/front/Administration/AnalyticsClient", () => ({ analyticsClient: { trackAdminEvent: vi.fn() } }));
vi.mock("../../../src/front/Stores/ErrorStore", () => ({ warningMessageStore: { addWarningMessage: mocks.warning } }));
vi.mock("../../../src/front/Components/ActionBar/MenuIcons/AdditionalMenuItems.svelte", async () => ({
    default: (await import("../../../src/front/Components/ActionBar/MenuIcons/UnclaimPersonalDeskModal.svelte"))
        .default,
}));
vi.mock("../../../src/front/Components/Modal/ReleaseNotesModal.svelte", async () => ({
    default: (await import("../../../src/front/Components/ActionBar/MenuIcons/UnclaimPersonalDeskModal.svelte"))
        .default,
}));
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const labels = {
        personalDesk: {
            label: () => "Walk",
            unclaim: () => "Release",
            unclaimConfirmation: ({ name }: { name: string }) => `Release ${name}?`,
            errorNotFound: () => "Missing",
            errorUnclaiming: () => "Failed",
        },
        cancel: () => "Cancel",
        mapEditor: () => "Edit map",
        globalMessage: () => "Global message",
        nerf: {
            equip: () => "Equip the Nerf",
            unequip: () => "Put away the Nerf",
            help: () => "SPACE: fire",
        },
    };
    return {
        LL: readable({
            actionbar: labels,
            refreshPrompt: { whatsNew: () => "News" },
            mapEditor: {
                settings: { weather: { title: () => "Weather" } },
                sideBar: { exploreTheRoom: () => "Explore" },
            },
            menu: { settings: { night: { label: () => "Day/night cycle" } } },
        }),
    };
});
vi.mock("../../../src/front/Stores/MenuStore", async () => {
    const { writable } = await import("svelte/store");
    return {
        globalMessageVisibleStore: writable(false),
        mapManagerActivated: writable(false),
        mapEditorMenuVisibleStore: writable(false),
        mapEditorActivated: writable(false),
        openedMenuStore: { close: vi.fn() },
        helpTextDisabledStore: writable(true),
    };
});
const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
function click(label: string): void {
    const button = [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);
    if (!button) throw new Error(`Missing button: ${label}`);
    flushSync(() => button.click());
}
function openConfirmation(): () => Promise<void> {
    flushSync(() => {
        component = mount(MapSubMenuContent, { target });
    });
    const button = target.querySelector<HTMLButtonElement>('[data-testid="unclaim-personal-desk-button"]');
    if (!button) throw new Error("Missing release action");
    flushSync(() => button.click());
    const props: { onConfirm: () => Promise<void> } = mocks.open.mock.calls[0][1];
    return props.onConfirm;
}
beforeEach(() => {
    vi.clearAllMocks();
    mapEditorActivated.set(false);
    mapManagerActivated.set(false);
    (mapEditorMenuVisibleStore as Writable<boolean>).set(false);
    (globalMessageVisibleStore as Writable<boolean>).set(false);
    mocks.uuid = "human";
    mocks.desk = {
        id: "desk-one",
        name: "Desk One",
        properties: [{ type: "personalAreaPropertyData", ownerId: "human" }],
    };
    mocks.scene = {
        getMapEditorModeManager: () => ({ unclaimPersonalArea: mocks.release }),
        getGameMapFrontWrapper: () => ({ areasManager: { getAreasByPropertyType: () => [{ areaData: mocks.desk }] } }),
    };
    personalAreaDataStore.set({
        ...mocks.desk,
        x: 0,
        y: 0,
        width: 32,
        height: 32,
        visible: true,
        properties: [
            {
                id: "property",
                type: "personalAreaPropertyData",
                ownerId: "human",
                accessClaimMode: "dynamic",
                allowedTags: [],
            },
        ],
    });
    document.body.append(target);
});
afterEach(async () => {
    const mountedComponent = component;
    component = undefined;
    if (mountedComponent) await unmount(mountedComponent, { outro: false });
    target.replaceChildren();
    target.remove();
    personalAreaDataStore.set(null);
    vi.restoreAllMocks();
});
describe("personal desk release confirmation", () => {
    it("keeps in Tools only actions that have no other home", () => {
        mapManagerActivated.set(true);
        mapEditorActivated.set(true);
        (mapEditorMenuVisibleStore as Writable<boolean>).set(true);
        (globalMessageVisibleStore as Writable<boolean>).set(true);
        flushSync(() => {
            component = mount(MapSubMenuContent, { target });
        });
        const labels = [...target.querySelectorAll("button")].map((button) => button.textContent?.trim());
        // Weather lives in the editor (Configure the room), day/night in Settings, exploring in the floating explorer.
        expect(labels).toEqual(["News", "Equip the Nerf", "Edit map", "Global message", "Walk", "Release"]);
    });
    it("opens without releasing and confirms the current owned desk once", async () => {
        const confirm = openConfirmation();
        expect(mocks.release).not.toHaveBeenCalled();
        let finish: (() => void) | undefined;
        mocks.release.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                }),
        );
        const first = confirm();
        await confirm();
        expect(mocks.release).toHaveBeenCalledExactlyOnceWith(mocks.desk);
        finish?.();
        await first;
    });
    it.each(["owner", "account", "desk", "scene"])("rejects confirmation after %s changes", async (change) => {
        const confirm = openConfirmation();
        if (change === "owner") mocks.desk.properties[0].ownerId = "other";
        if (change === "account") mocks.uuid = "other";
        if (change === "desk") personalAreaDataStore.set(null);
        if (change === "scene") mocks.scene = {};
        await confirm();
        expect(mocks.release).not.toHaveBeenCalled();
        expect(mocks.warning).toHaveBeenCalled();
    });
    it.each(["Cancel", "Escape", "close"])("dismisses with %s without confirming", (action) => {
        const confirm = vi.fn().mockResolvedValue(undefined);
        flushSync(() => {
            component = mount(UnclaimPersonalDeskModal, {
                target,
                props: { isOpen: true, deskName: "Desk One", onConfirm: confirm },
            });
        });
        expect(target.textContent).toContain("Release Desk One?");
        if (action === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        else if (action === "close") target.querySelector<HTMLButtonElement>('[data-testid="closeModal"]')?.click();
        else click(action);
        expect(mocks.close).toHaveBeenCalledOnce();
        expect(confirm).not.toHaveBeenCalled();
    });
    it("confirms only once after repeated clicks", () => {
        const confirm = vi.fn().mockResolvedValue(undefined);
        flushSync(() => {
            component = mount(UnclaimPersonalDeskModal, {
                target,
                props: { isOpen: true, deskName: "Desk One", onConfirm: confirm },
            });
        });
        click("Release");
        click("Release");
        expect(confirm).toHaveBeenCalledOnce();
    });
});
