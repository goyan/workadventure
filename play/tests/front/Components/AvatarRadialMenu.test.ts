import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get } from "svelte/store";
import AvatarRadialMenu from "@wa/front/Components/ActionsMenu/AvatarRadialMenu.svelte";
import { loadLocaleAsync } from "@wa/i18n/i18n-util.async";
import { setLocale } from "@wa/i18n/i18n-svelte";
import { torchEquippedStore, torchIntensityStore } from "@wa/front/Stores/TorchStore";
import type { WokaMenuData } from "@wa/front/Stores/WokaMenuStore";

let component: ReturnType<typeof mount> | undefined;
beforeAll(async () => {
    await loadLocaleAsync("en-US");
    setLocale("en-US");
});
afterEach(async () => {
    if (component) await unmount(component);
    document.body.replaceChildren();
    torchEquippedStore.set(false);
    torchIntensityStore.set(100);
    localStorage.clear();
    vi.restoreAllMocks();
});

function mountWheel(actions: WokaMenuData["actions"]): HTMLDivElement {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const target = document.createElement("div");
    document.body.append(target);
    flushSync(() => {
        component = mount(AvatarRadialMenu, {
            target,
            props: { menu: { wokaName: "Me", userId: -1, userUuid: "self", isSelf: true, actions } },
        });
    });
    return target;
}

const wheelActions = (): WokaMenuData["actions"] => [
    { uuid: "profile", testId: "avatar-profile", actionName: "Profile", callback: vi.fn() },
    { uuid: "torch", testId: "avatar-torch", actionName: "Put away the torch", icon: "torch", callback: vi.fn() },
    { uuid: "dance", testId: "avatar-action-dance", actionName: "Dance", callback: vi.fn() },
];

describe("own avatar wheel", () => {
    it("puts the profile in the center and keeps actions around it", () => {
        // jsdom has no canvas: a fake 2D context records the pixels drawn.
        const context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: "" };
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
            context as unknown as CanvasRenderingContext2D,
        );
        const profile = vi.fn();
        const target = document.createElement("div");
        document.body.append(target);
        flushSync(() => {
            component = mount(AvatarRadialMenu, {
                target,
                props: {
                    menu: {
                        wokaName: "Me",
                        userId: -1,
                        userUuid: "self",
                        isSelf: true,
                        actions: [
                            { uuid: "profile", testId: "avatar-profile", actionName: "Profile", callback: profile },
                            {
                                uuid: "dance",
                                testId: "avatar-action-dance",
                                actionName: "Dance",
                                icon: "dance",
                                detail: "near a dance floor",
                                callback: vi.fn(),
                            },
                            { uuid: "coffee", testId: "avatar-action-coffee", actionName: "Coffee", callback: vi.fn() },
                        ],
                    },
                },
            });
        });
        const center = target.querySelector<HTMLButtonElement>('[data-testid="avatar-profile"]');
        expect(center?.classList.contains("wheel-center")).toBe(true);
        expect(target.querySelectorAll(".wheel-action")).toHaveLength(2);
        // The wheel is drawn in pixels; actions show their pixel icon, or their emoji when they have none.
        expect(target.querySelector("canvas.wheel-pixels")).not.toBeNull();
        expect(context.fillRect.mock.calls.length).toBeGreaterThan(1000);
        expect(target.querySelector('[data-testid="avatar-action-dance"] [data-testid="pixel-icon"]')).not.toBeNull();
        expect(target.querySelector('[data-testid="avatar-action-dance"] .wheel-detail')?.textContent).toBe(
            "near a dance floor",
        );
        center?.click();
        expect(profile).toHaveBeenCalledOnce();
    });

    describe("intensity of the torch", () => {
        const control = (target: HTMLElement) => target.querySelector('[data-testid="avatar-torch-intensity"]');

        it("is only there while the torch is equipped", () => {
            const target = mountWheel(wheelActions());
            expect(control(target)).toBeNull();
            flushSync(() => torchEquippedStore.set(true));
            expect(control(target)).not.toBeNull();
            expect(control(target)?.getAttribute("aria-label")).toBe("Torch intensity");
        });

        it("is not on a submenu of the wheel, which has no torch among its actions", () => {
            torchEquippedStore.set(true);
            const target = mountWheel([{ uuid: "back", testId: "avatar-back", actionName: "Back", callback: vi.fn() }]);
            expect(control(target)).toBeNull();
        });

        it("starts at the full 100 % and steps by 10 % between 10 and 100 %, the wheel staying open", () => {
            torchEquippedStore.set(true);
            const target = mountWheel(wheelActions());
            const value = target.querySelector('[data-testid="avatar-torch-intensity-value"]');
            const lower = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-lower"]');
            const raise = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-raise"]');
            expect(value?.textContent).toBe("100%");
            expect(lower?.getAttribute("aria-label")).toBe("Dim the torch");
            expect(raise?.getAttribute("aria-label")).toBe("Brighten the torch");
            expect(raise?.getAttribute("aria-disabled")).toBe("true");

            flushSync(() => lower?.click());
            expect(get(torchIntensityStore)).toBe(90);
            expect(value?.textContent).toBe("90%");
            expect(raise?.getAttribute("aria-disabled")).toBe("false");
            for (let click = 0; click < 12; click++) flushSync(() => lower?.click());
            expect(get(torchIntensityStore)).toBe(10);
            expect(lower?.getAttribute("aria-disabled")).toBe("true");
            flushSync(() => raise?.click());
            expect(get(torchIntensityStore)).toBe(20);
            expect(target.querySelector('[data-testid="avatar-radial-menu"]')).not.toBeNull();
        });

        it("fades the rest of the wheel while it is pointed at or focused, to show the avatar and its light", () => {
            torchEquippedStore.set(true);
            const target = mountWheel(wheelActions());
            const wheel = target.querySelector('[data-testid="avatar-radial-menu"]');
            const group = control(target);
            const lower = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-lower"]');
            const raise = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-raise"]');
            const faded = () => wheel?.classList.contains("faded");
            expect(faded()).toBe(false);

            flushSync(() => group?.dispatchEvent(new PointerEvent("pointerenter")));
            expect(faded()).toBe(true);
            // The control stays usable, the wheel open.
            flushSync(() => lower?.click());
            expect(get(torchIntensityStore)).toBe(90);
            expect(lower?.getAttribute("aria-disabled")).toBe("false");
            flushSync(() => group?.dispatchEvent(new PointerEvent("pointerleave")));
            expect(faded()).toBe(false);

            // From the keyboard: focused, from one button to the other, then away.
            flushSync(() => lower?.focus());
            expect(faded()).toBe(true);
            flushSync(() => raise?.focus());
            expect(faded()).toBe(true);
            flushSync(() => target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch"]')?.focus());
            expect(faded()).toBe(false);
            expect(wheel).not.toBeNull();
        });

        it("is reached with the keys that go around the wheel", () => {
            torchEquippedStore.set(true);
            const target = mountWheel(wheelActions());
            const lower = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-lower"]');
            const raise = target.querySelector<HTMLButtonElement>('[data-testid="avatar-torch-intensity-raise"]');
            const press = (key: string) =>
                flushSync(() => window.dispatchEvent(new KeyboardEvent("keydown", { key, cancelable: true })));
            // The two actions, the profile in the center, then the intensity.
            press("ArrowRight");
            press("ArrowRight");
            press("ArrowRight");
            expect(document.activeElement).toBe(lower);
            press("ArrowRight");
            expect(document.activeElement).toBe(raise);
            press("ArrowRight");
            expect(document.activeElement).toBe(target.querySelector('[data-testid="avatar-torch"]'));
        });
    });
});
