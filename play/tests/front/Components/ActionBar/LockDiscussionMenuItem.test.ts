// @vitest-environment node

import { render } from "svelte/server";
import { get } from "svelte/store";
import type { Writable } from "svelte/store";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import LockDiscussionMenuItem from "../../../../src/front/Components/ActionBar/MenuIcons/LockDiscussionMenuItem.svelte";
import { currentPlayerLockableAreasStore } from "../../../../src/front/Stores/CurrentPlayerAreaLockStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

vi.mock("../../../../src/front/Components/ActionBar/ActionBarButton.svelte", async () => ({
    default: (await import("./LockActionBarButton.svelte")).default,
}));
const stores = vi.hoisted(() => ({
    groupLock: undefined as unknown as Writable<boolean | undefined>,
}));
vi.mock("../../../../src/front/Stores/CurrentPlayerGroupStore", async () => {
    const { writable: makeWritable } = await import("svelte/store");
    stores.groupLock = makeWritable<boolean | undefined>(undefined);
    return { currentPlayerGroupLockStateStore: stores.groupLock };
});
vi.mock("../../../../src/front/Stores/MenuStore", async () => {
    const { writable: makeWritable } = await import("svelte/store");
    return { openedMenuStore: makeWritable(undefined) };
});
vi.mock("../../../../src/front/Components/PopUp/LockableAreaPicker.svelte", () => ({ default: vi.fn() }));
vi.mock("../../../../src/front/Components/Icons/LockIcon.svelte", () => ({ default: vi.fn() }));
vi.mock("../../../../src/front/Components/Icons/LockOpenIcon.svelte", () => ({ default: vi.fn() }));
vi.mock("../../../../src/front/Administration/AnalyticsClient", () => ({ analyticsClient: {} }));
vi.mock("../../../../src/front/Utils/svelte-floatingui-show", () => ({ showFloatingUi: vi.fn() }));
vi.mock("../../../../src/front/Stores/AreaPropertyVariablesStore", () => ({ setAreaPropertyLockState: vi.fn() }));
vi.mock("../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            connection: { getAllTags: () => [] },
            getGameMapFrontWrapper: () => ({
                getGameMap: () => ({
                    getWamFile: () => ({
                        getGameMapAreas: () => ({
                            getArea: () => ({ properties: [{ type: "lockableAreaPropertyData", id: "p" }] }),
                        }),
                    }),
                }),
            }),
        }),
    },
}));

const office = { areaId: "a", propertyId: "p", lockState: false, areaName: "Bureau" };

describe("LockDiscussionMenuItem", () => {
    const previousLocale = get(locale);

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        setLocale(previousLocale);
    });

    beforeEach(() => {
        currentPlayerLockableAreasStore.set([]);
        stores.groupLock.set(undefined);
    });

    it("presents the button as closing the door in a lockable area, highlighted, without the bubble video", () => {
        currentPlayerLockableAreasStore.set([office]);

        const { body } = render(LockDiscussionMenuItem);

        expect(body).toContain("Fermer la porte");
        expect(body).toContain("Les autres devront toquer pour entrer.");
        expect(body).not.toContain("Verrouiller la discussion");
        expect(body).not.toContain("LockBubble.mp4");
        expect(body).toContain('data-state="active"');
    });

    it("offers to reopen the door once the area is locked", () => {
        currentPlayerLockableAreasStore.set([{ ...office, lockState: true }]);

        const { body } = render(LockDiscussionMenuItem);

        expect(body).toContain("Rouvrir la porte");
        expect(body).toContain('data-state="forbidden"');
    });

    it("keeps the discussion wording in a bubble outside any lockable area", () => {
        stores.groupLock.set(false);

        const { body } = render(LockDiscussionMenuItem);

        expect(body).toContain("Verrouiller la discussion");
        expect(body).toContain("LockBubble.mp4");
        expect(body).not.toContain("Fermer la porte");
        expect(body).toContain('data-state="normal"');
    });
});
