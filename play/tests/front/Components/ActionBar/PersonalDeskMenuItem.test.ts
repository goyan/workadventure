import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import type { AreaData } from "@workadventure/map-editor";
import PersonalDeskMenuItem from "../../../../src/front/Components/ActionBar/MenuIcons/PersonalDeskMenuItem.svelte";
import { isInsidePersonalAreaStore, personalAreaDataStore } from "../../../../src/front/Stores/PersonalDeskStore";
import { shortcutOverridesStore } from "../../../../src/front/Stores/ShortcutsStore";
import { userSeatedStore } from "../../../../src/front/Stores/GameStore";
import { locale, setLocale } from "../../../../src/i18n/i18n-svelte";
import { loadLocaleAsync } from "../../../../src/i18n/i18n-util.async";

const actions = vi.hoisted(() => ({ goToPersonalDesk: vi.fn(), findFreeDesk: vi.fn() }));

vi.mock("../../../../src/front/Components/ActionBar/ActionBarButton.svelte", async () => ({
    default: (await import("./DeskActionBarButton.svelte")).default,
}));
vi.mock("../../../../src/front/Components/ActionBar/MenuIcons/personalDeskActions", () => actions);

const desk = { id: "desk-1", name: "Bureau d'Ada", properties: [] } as unknown as AreaData;

describe("PersonalDeskMenuItem", () => {
    const previousLocale = get(locale);
    let component: ReturnType<typeof mount> | undefined;

    beforeAll(async () => {
        await loadLocaleAsync("fr-FR");
        setLocale("fr-FR");
    });

    afterAll(() => {
        setLocale(previousLocale);
    });

    beforeEach(() => {
        actions.goToPersonalDesk.mockReset().mockResolvedValue(undefined);
        actions.findFreeDesk.mockReset();
        personalAreaDataStore.set(null);
        isInsidePersonalAreaStore.set(false);
        userSeatedStore.set(false);
        shortcutOverridesStore.resetAll();
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        document.body.innerHTML = "";
    });

    function renderButton(): HTMLButtonElement {
        component = mount(PersonalDeskMenuItem, { target: document.body });
        flushSync();
        const button = document.body.querySelector<HTMLButtonElement>('[data-testid="desk-action-bar-button"]');
        if (!button) throw new Error("desk button not rendered");
        return button;
    }

    const text = (button: HTMLElement, part: string) => button.querySelector(`[data-${part}]`)?.textContent ?? "";

    it("walks to the reserved desk and shows the desk shortcut", () => {
        personalAreaDataStore.set(desk);

        const button = renderButton();

        expect(button.dataset.state).toBe("normal");
        expect(text(button, "title")).toBe("Aller à mon bureau");
        expect(text(button, "desc")).toBe("Votre avatar marche jusqu’à votre bureau.");
        expect(text(button, "shortcuts")).toBe("Ctrl+D");

        button.click();

        expect(actions.goToPersonalDesk).toHaveBeenCalledTimes(1);
        expect(actions.findFreeDesk).not.toHaveBeenCalled();
    });

    it("sits down at the desk when standing inside it", () => {
        personalAreaDataStore.set(desk);
        isInsidePersonalAreaStore.set(true);

        const button = renderButton();

        expect(button.dataset.state).toBe("normal");
        expect(text(button, "title")).toBe("S’asseoir à mon bureau");
        expect(text(button, "shortcuts")).toBe("Ctrl+D");

        button.click();

        expect(actions.goToPersonalDesk).toHaveBeenCalledTimes(1);
    });

    it("is greyed out with an explanation once seated at the desk", () => {
        personalAreaDataStore.set(desk);
        isInsidePersonalAreaStore.set(true);
        userSeatedStore.set(true);

        const button = renderButton();

        expect(button.dataset.state).toBe("disabled");
        expect(text(button, "title")).toBe("Vous êtes à votre bureau");
    });

    it("still walks to the desk when seated elsewhere", () => {
        personalAreaDataStore.set(desk);
        userSeatedStore.set(true);

        const button = renderButton();

        expect(button.dataset.state).toBe("normal");
        expect(text(button, "title")).toBe("Aller à mon bureau");
    });

    it("offers to find a free desk when none is reserved on this map", () => {
        const button = renderButton();

        expect(button.dataset.state).toBe("normal");
        expect(text(button, "title")).toBe("Trouver un bureau libre");
        expect(text(button, "desc")).toBe("Vous n’avez pas de bureau sur cette carte : choisissez-en un libre.");
        expect(text(button, "shortcuts")).toBe("");

        button.click();

        expect(actions.findFreeDesk).toHaveBeenCalledTimes(1);
        expect(actions.goToPersonalDesk).not.toHaveBeenCalled();
    });

    it("follows a rebound shortcut and hides it when the user removed it", () => {
        personalAreaDataStore.set(desk);
        shortcutOverridesStore.assign("walkMyDesk", { code: "KeyB", label: "B", mod: false, alt: true, shift: false });

        const button = renderButton();
        expect(text(button, "shortcuts")).toBe("Alt+B");

        // Moving the key to another action leaves the desk without a shortcut.
        shortcutOverridesStore.assign(
            "rotatePlayer",
            { code: "KeyB", label: "B", mod: false, alt: true, shift: false },
            "walkMyDesk",
        );
        flushSync();
        expect(text(button, "shortcuts")).toBe("");
    });
});
