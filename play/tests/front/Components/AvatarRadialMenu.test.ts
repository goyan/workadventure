import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import AvatarRadialMenu from "@wa/front/Components/ActionsMenu/AvatarRadialMenu.svelte";
import { loadLocaleAsync } from "@wa/i18n/i18n-util.async";
import { setLocale } from "@wa/i18n/i18n-svelte";

let component: ReturnType<typeof mount> | undefined;
beforeAll(async () => {
    await loadLocaleAsync("en-US");
    setLocale("en-US");
});
afterEach(async () => {
    if (component) await unmount(component);
    document.body.replaceChildren();
});

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
        center?.click();
        expect(profile).toHaveBeenCalledOnce();
    });
});
