import { get } from "svelte/store";
import * as Sentry from "@sentry/svelte";
import LL from "../../i18n/i18n-svelte";
import { raceTimeout } from "../Utils/PromiseUtils";
import { decodeHtmlEntities } from "../Chat/decodeHtmlEntities";
import type { NotificationWA } from "./Notification";
import { defaultOptions } from "./Notification";

/**
 * Some environments never display service-worker notifications: `showNotification()` never settles in
 * Electron-based clients, and service workers are unavailable in Firefox private windows. Past this delay,
 * a page notification is shown instead.
 */
export const SERVICE_WORKER_NOTIFICATION_TIMEOUT_MS = 3000;

export class MessageNotification implements NotificationWA {
    constructor(
        private userName: string,
        private message: string,
        private chatRoomId: string,
        private chatRoomName: string,
        private isMention = false,
        private options = defaultOptions,
    ) {}

    public async sendNotification() {
        const numberOfChar = 60;
        const message = decodeHtmlEntities(this.message);
        const messageToDisplay = message.length > numberOfChar ? message.slice(0, numberOfChar) + "..." : message;
        const title = this.isMention
            ? get(LL).notification.mention({ name: this.userName })
            : get(LL).notification.message({ name: this.userName });
        const body = `${title} : ${messageToDisplay}`;

        try {
            await raceTimeout(this.showServiceWorkerNotification(body), SERVICE_WORKER_NOTIFICATION_TIMEOUT_MS);
        } catch (error) {
            console.warn("Service worker notification unavailable, falling back to a page notification", error);
            this.showPageNotification(body);
        }
    }

    private async showServiceWorkerNotification(body: string): Promise<void> {
        // The page-wide service worker (Network/ServiceWorker.ts) owns the "/" scope and the notificationclick
        // handler. Registering another script here would replace it.
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(this.chatRoomName, {
            ...this.options,
            body,
            data: { chatRoomId: this.chatRoomId, tabUrl: window.location.href },
        });
    }

    /** Mirrors the service worker's notificationclick handler: focus this tab, then open the chat on the room. */
    private showPageNotification(body: string): void {
        try {
            const notification = new Notification(this.chatRoomName, { ...this.options, body });
            notification.onclick = () => {
                notification.close();
                window.focus();
                new BroadcastChannel("message").postMessage({
                    type: "openChat",
                    data: { chatRoomId: this.chatRoomId },
                });
            };
        } catch (error) {
            console.error("Error while sending message notification", error);
            Sentry.captureException(error);
        }
    }
}
