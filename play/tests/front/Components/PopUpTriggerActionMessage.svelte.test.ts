import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import PopUpTriggerActionMessage from "../../../src/front/Components/PopUp/PopUpTriggerActionMessage.svelte";
import type { UserInputManager } from "../../../src/front/Phaser/UserInput/UserInputManager";

/** The interaction key, as the game scene dispatches it to its listeners. */
function fakeUserInputManager() {
    const listeners = new Set<() => void>();
    const manager = {
        addSpaceEventListener: (callback: () => void) => listeners.add(callback),
        removeSpaceEventListener: (callback: () => void) => listeners.delete(callback),
    } as unknown as UserInputManager;
    return { manager, listeners, pressSpace: () => [...listeners].forEach((listener) => listener()) };
}

describe("PopUpTriggerActionMessage", () => {
    let component: ReturnType<typeof mount> | undefined;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted, { outro: false });
    });

    it("the interaction key runs the current action when the same prompt is given a new one", () => {
        const target = document.createElement("div");
        const input = fakeUserInputManager();
        const first = vi.fn();
        const second = vi.fn();
        // The popup store keeps the component of a popup shown again under the same uuid, and gives it new props.
        const props = $state({
            message: "[SPACE] to tame this animal",
            onclick: first,
            userInputManager: input.manager,
        });
        component = mount(PopUpTriggerActionMessage, { target, props });
        flushSync();
        props.onclick = second;
        flushSync();
        input.pressSpace();
        expect(second).toHaveBeenCalledOnce();
        expect(first).not.toHaveBeenCalled();
        (target.querySelector(".popup-container") as HTMLElement).click();
        expect(second).toHaveBeenCalledTimes(2);
    });

    it("listens to the interaction key once, and not any more once gone", async () => {
        const target = document.createElement("div");
        const input = fakeUserInputManager();
        const props = $state({ message: "[SPACE] to sit down", onclick: vi.fn(), userInputManager: input.manager });
        component = mount(PopUpTriggerActionMessage, { target, props });
        flushSync();
        props.onclick = vi.fn();
        flushSync();
        expect(input.listeners.size).toBe(1);
        const mounted = component;
        component = undefined;
        await unmount(mounted, { outro: false });
        expect(input.listeners.size).toBe(0);
    });
});
