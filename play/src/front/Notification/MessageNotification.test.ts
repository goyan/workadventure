import { readable } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageNotification, SERVICE_WORKER_NOTIFICATION_TIMEOUT_MS } from "./MessageNotification";

vi.mock("../../i18n/i18n-svelte", () => ({
    default: readable({ notification: { message: ({ name }: { name: string }) => `${name} sent a message` } }),
}));

class FakeNotification {
    static instances: FakeNotification[] = [];
    onclick: (() => void) | null = null;
    close = vi.fn();

    constructor(
        public title: string,
        public options: NotificationOptions,
    ) {
        FakeNotification.instances.push(this);
    }
}

function useServiceWorker(serviceWorker: { ready: Promise<{ showNotification: unknown }> } | undefined): void {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
}

describe("MessageNotification", () => {
    const notification = new MessageNotification("Ada", "Hello", "!room:matrix", "Team");

    beforeEach(() => {
        FakeNotification.instances = [];
        vi.stubGlobal("Notification", FakeNotification);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        useServiceWorker(undefined);
    });

    it("shows the notification through the service worker when it is available", async () => {
        const showNotification = vi.fn().mockResolvedValue(undefined);
        useServiceWorker({ ready: Promise.resolve({ showNotification }) });

        await notification.sendNotification();

        expect(showNotification).toHaveBeenCalledWith(
            "Team",
            expect.objectContaining({
                body: "Ada sent a message : Hello",
                data: expect.objectContaining({ chatRoomId: "!room:matrix" }),
            }),
        );
        expect(FakeNotification.instances).toHaveLength(0);
    });

    it("falls back to a page notification when the service worker never displays it", async () => {
        vi.useFakeTimers();
        useServiceWorker({ ready: Promise.resolve({ showNotification: () => new Promise(() => undefined) }) });

        const sending = notification.sendNotification();
        await vi.advanceTimersByTimeAsync(SERVICE_WORKER_NOTIFICATION_TIMEOUT_MS);
        await sending;

        expect(FakeNotification.instances).toHaveLength(1);
        expect(FakeNotification.instances[0].title).toBe("Team");
        expect(FakeNotification.instances[0].options.body).toBe("Ada sent a message : Hello");
    });

    it("falls back to a page notification when service workers are unavailable", async () => {
        useServiceWorker(undefined);

        await notification.sendNotification();

        expect(FakeNotification.instances).toHaveLength(1);
    });

    it("opens the chat on the room when the page notification is clicked, like the service worker does", async () => {
        useServiceWorker(undefined);
        const postMessage = vi.spyOn(BroadcastChannel.prototype, "postMessage");
        const focus = vi.spyOn(window, "focus").mockImplementation(() => undefined);

        await notification.sendNotification();
        FakeNotification.instances[0].onclick?.();

        expect(focus).toHaveBeenCalled();
        expect(FakeNotification.instances[0].close).toHaveBeenCalled();
        expect(postMessage).toHaveBeenCalledWith({ type: "openChat", data: { chatRoomId: "!room:matrix" } });
    });
});
