import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvailabilityStatus } from "@workadventure/messages";
import type { Writable } from "svelte/store";

const { getNotification } = vi.hoisted(() => ({
    getNotification: vi.fn(() => true),
}));

vi.mock("../../../src/front/Stores/MediaStore", async () => {
    const { writable } = await import("svelte/store");
    return { availabilityStatusStore: writable(0), requestedStatusStore: writable(null) };
});
vi.mock("../../../src/front/Connection/LocalUserStore", () => ({
    localUserStore: { getNotification },
}));

import {
    availabilityStatusStore as mockedStatusStore,
    requestedStatusStore as mockedRequestedStore,
} from "../../../src/front/Stores/MediaStore";
import {
    notifySystem,
    shouldNotify,
    type NotifyContext,
    type SystemNotificationKind,
} from "../../../src/front/Notification/SystemNotifier";

const kinds: SystemNotificationKind[] = ["wave", "privateMessage", "knock", "jamLinkRequest"];
const base: NotifyContext = { focused: false, permission: "granted", enabled: true, doNotDisturb: false };

describe("shouldNotify", () => {
    it.each(kinds)("returns true for %s when allowed", (kind) => {
        expect(shouldNotify(kind, base)).toBe(true);
    });
    it.each(kinds)("returns false for %s when the window is focused", (kind) => {
        expect(shouldNotify(kind, { ...base, focused: true })).toBe(false);
    });
    it.each(kinds)("returns false for %s when permission is not granted", (kind) => {
        expect(shouldNotify(kind, { ...base, permission: "default" })).toBe(false);
        expect(shouldNotify(kind, { ...base, permission: "denied" })).toBe(false);
    });
    it.each(kinds)("returns false for %s when notifications are disabled", (kind) => {
        expect(shouldNotify(kind, { ...base, enabled: false })).toBe(false);
    });
    it("lets only knock through in do not disturb", () => {
        const dnd = { ...base, doNotDisturb: true };
        expect(shouldNotify("knock", dnd)).toBe(true);
        expect(shouldNotify("wave", dnd)).toBe(false);
        expect(shouldNotify("privateMessage", dnd)).toBe(false);
        // Like a wave: a request for a new Jam link is not urgent.
        expect(shouldNotify("jamLinkRequest", dnd)).toBe(false);
    });
});

describe("notifySystem", () => {
    let instances: { title: string; options: unknown; close: ReturnType<typeof vi.fn>; onclick?: () => void }[];
    let ctor: ReturnType<typeof vi.fn>;

    function stubNotification(permission: NotificationPermission, throws = false) {
        instances = [];
        ctor = vi.fn(function (this: (typeof instances)[number], title: string, options: unknown) {
            if (throws) throw new Error("boom");
            this.title = title;
            this.options = options;
            this.close = vi.fn();
            instances.push(this);
        });
        (ctor as unknown as { permission: string }).permission = permission;
        vi.stubGlobal("Notification", ctor);
    }

    beforeEach(() => {
        vi.spyOn(document, "hasFocus").mockReturnValue(false);
        vi.spyOn(window, "focus").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        getNotification.mockReturnValue(true);
        (mockedStatusStore as unknown as Writable<number>).set(AvailabilityStatus.ONLINE);
        (mockedRequestedStore as unknown as Writable<number | null>).set(null);
        stubNotification("granted");
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const notif = { kind: "wave" as const, title: "Alice", body: "waves at you", tag: "wave:1" };

    it("shows a notification with body and tag when allowed", () => {
        notifySystem(notif);
        expect(ctor).toHaveBeenCalledTimes(1);
        expect(instances[0].title).toBe("Alice");
        expect(instances[0].options).toMatchObject({ body: "waves at you", tag: "wave:1" });
    });

    it.each(kinds)("asks to renotify when a %s replaces a notification with the same tag", (kind) => {
        notifySystem({ ...notif, kind });
        expect(instances[0].options).toMatchObject({ tag: "wave:1", renotify: true });
    });

    it("does nothing when not allowed", () => {
        stubNotification("denied");
        notifySystem(notif);
        expect(ctor).not.toHaveBeenCalled();
    });

    it("does nothing when the window is focused", () => {
        vi.spyOn(document, "hasFocus").mockReturnValue(true);
        notifySystem(notif);
        expect(ctor).not.toHaveBeenCalled();
    });

    it("does nothing when the user disabled notifications", () => {
        getNotification.mockReturnValue(false);
        notifySystem(notif);
        expect(ctor).not.toHaveBeenCalled();
    });

    it("blocks a wave but not a knock in do not disturb", () => {
        (mockedStatusStore as unknown as Writable<number>).set(AvailabilityStatus.DO_NOT_DISTURB);
        notifySystem(notif);
        expect(ctor).not.toHaveBeenCalled();
        notifySystem({ ...notif, kind: "knock", tag: "knock:a:1" });
        expect(ctor).toHaveBeenCalledTimes(1);
    });

    it("blocks a wave and private message but not a knock when DND is requested while effective status is JITSI", () => {
        (mockedRequestedStore as unknown as Writable<number | null>).set(AvailabilityStatus.DO_NOT_DISTURB);
        (mockedStatusStore as unknown as Writable<number>).set(AvailabilityStatus.JITSI);
        notifySystem(notif);
        notifySystem({ ...notif, kind: "privateMessage", tag: "pm:1" });
        expect(ctor).not.toHaveBeenCalled();
        notifySystem({ ...notif, kind: "knock", tag: "knock:a:1" });
        expect(ctor).toHaveBeenCalledTimes(1);
    });

    it("does nothing when Notification is undefined", () => {
        vi.stubGlobal("Notification", undefined);
        expect(() => notifySystem(notif)).not.toThrow();
    });

    it("swallows a throwing constructor", () => {
        stubNotification("granted", true);
        expect(() => notifySystem(notif)).not.toThrow();
        expect(instances).toHaveLength(0);
        expect(console.warn).toHaveBeenCalled();
    });

    it("focuses the window then calls onClick on click", () => {
        const order: string[] = [];
        vi.spyOn(window, "focus").mockImplementation(() => {
            order.push("focus");
        });
        notifySystem({ ...notif, onClick: () => order.push("onClick") });
        instances[0].onclick?.();
        expect(instances[0].close).toHaveBeenCalled();
        expect(order).toEqual(["focus", "onClick"]);
    });

    it("does not throw on click without onClick", () => {
        notifySystem(notif);
        expect(() => instances[0].onclick?.()).not.toThrow();
    });

    it("swallows an onClick that throws", () => {
        notifySystem({
            ...notif,
            onClick: () => {
                throw new Error("x");
            },
        });
        expect(() => instances[0].onclick?.()).not.toThrow();
        expect(console.warn).toHaveBeenCalled();
    });
});
