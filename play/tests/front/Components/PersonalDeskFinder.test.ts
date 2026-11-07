import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { PersonalAreaAccessClaimMode, type AreaData } from "@workadventure/map-editor";
import { canClaimPersonalDesk } from "../../../src/front/Stores/PersonalDeskStore";
import PersonalDeskFinderModal from "../../../src/front/Components/Modal/PersonalDeskFinderModal.svelte";

const mocks = vi.hoisted(() => ({
    logged: true,
    areas: [] as AreaData[],
    move: vi.fn(),
    close: vi.fn(),
    warning: vi.fn(),
}));
vi.mock("@wa-modals", () => ({ modals: { close: mocks.close } }));
vi.mock("../../../src/front/Connection/LocalUserStore", () => ({ localUserStore: { isLogged: () => mocks.logged } }));
vi.mock("../../../src/front/Components/ActionBar/MenuIcons/LoginMenuItem.svelte", async () => ({
    default: (await import("../../../src/front/Components/UI/Button.svelte")).default,
}));
vi.mock("../../../src/front/Stores/MapEditorStore", () => ({ mapEditorModeStore: { switchMode: vi.fn() } }));
vi.mock("../../../src/front/Stores/ErrorStore", () => ({ warningMessageStore: { addWarningMessage: mocks.warning } }));
vi.mock("../../../src/front/Administration/AnalyticsClient", () => ({ analyticsClient: { trackAdminEvent: vi.fn() } }));
vi.mock("../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => ({
            getGameMapFrontWrapper: () => ({
                areasManager: { getAreasByPropertyType: () => mocks.areas.map((areaData) => ({ areaData })) },
            }),
            connection: { hasTag: (tag: string) => tag === "staff" },
            getCameraManager: () => ({ resumePlayerFollow: vi.fn() }),
            moveTo: mocks.move,
        }),
    },
}));
vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const LL = readable({
        actionbar: {
            login: () => "Sign in",
            personalDesk: {
                find: () => "Find a desk",
                findDescription: () => "Choose a desk",
                visit: () => "Go",
                noAvailable: () => "None available",
                loginToClaim: () => "Sign in first",
                errorMoving: () => "Cannot reach desk",
            },
        },
    });
    return { LL, default: LL };
});
function desk(
    id: string,
    ownerId: string | null = null,
    mode: PersonalAreaAccessClaimMode = PersonalAreaAccessClaimMode.enum.dynamic,
    allowedTags: string[] = [],
): AreaData {
    return {
        id,
        name: id,
        x: 100,
        y: 200,
        width: 64,
        height: 32,
        visible: true,
        properties: [{ id: "personal", type: "personalAreaPropertyData", ownerId, accessClaimMode: mode, allowedTags }],
    };
}
const target = document.createElement("div");
let component: ReturnType<typeof mount> | undefined;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.logged = true;
    mocks.areas = [
        desk("Free"),
        desk("Taken", "owner"),
        desk("Static", null, PersonalAreaAccessClaimMode.enum.static),
        desk("Restricted", null, PersonalAreaAccessClaimMode.enum.dynamic, ["admin"]),
    ];
    mocks.move.mockResolvedValue(undefined);
});
afterEach(async () => {
    const mounted = component;
    component = undefined;
    target.innerHTML = "";
    if (mounted) await unmount(mounted);
});
function render(): void {
    flushSync(() => {
        component = mount(PersonalDeskFinderModal, { target, props: { isOpen: true } });
    });
}
function go(): void {
    const button = [...target.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Go");
    if (!button) throw new Error("Missing visit action");
    flushSync(() => button.click());
}
describe("personal desk discovery", () => {
    it("respects login, ownership, dynamic claiming and allowed tags", () => {
        expect(canClaimPersonalDesk(desk("Free"), false, () => true)).toBe(false);
        expect(canClaimPersonalDesk(desk("Taken", "someone"), true, () => true)).toBe(false);
        expect(
            canClaimPersonalDesk(desk("Static", null, PersonalAreaAccessClaimMode.enum.static), true, () => true),
        ).toBe(false);
        expect(
            canClaimPersonalDesk(
                desk("Staff", null, PersonalAreaAccessClaimMode.enum.dynamic, ["staff"]),
                true,
                (tag) => tag === "staff",
            ),
        ).toBe(true);
    });
    it("lists only claimable desks and walks to one without assigning an owner", () => {
        render();
        expect(target.textContent).toContain("Free");
        expect(target.textContent).not.toContain("Taken");
        expect(target.textContent).not.toContain("Restricted");
        go();
        expect(mocks.move).toHaveBeenCalledWith({ x: 132, y: 216 }, true);
        expect(mocks.close).toHaveBeenCalledOnce();
        expect(mocks.areas[0]?.properties[0]).toMatchObject({ ownerId: null });
    });
    it("rechecks ownership before walking to a desk claimed while the dialog was open", () => {
        render();
        mocks.areas = [desk("Free", "someone")];
        go();
        expect(mocks.move).not.toHaveBeenCalled();
        expect(mocks.warning).toHaveBeenCalledWith("None available", { closable: true });
    });
    it("asks anonymous users to sign in and explains when no desk is available", () => {
        mocks.logged = false;
        render();
        expect(target.textContent).toContain("Sign in first");
        expect(target.textContent).not.toContain("Free");
    });
    it("shows the empty state and reports an unreachable desk", async () => {
        mocks.areas = [];
        render();
        expect(target.textContent).toContain("None available");
        const mounted = component;
        component = undefined;
        target.innerHTML = "";
        if (mounted) await unmount(mounted);
        mocks.areas = [desk("Free")];
        mocks.move.mockRejectedValue(new Error("Blocked"));
        render();
        go();
        await Promise.resolve();
        expect(mocks.warning).toHaveBeenCalledWith("Cannot reach desk", { closable: true });
    });
});
