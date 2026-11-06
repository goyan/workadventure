import { get } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import { localUserStore } from "../Connection/LocalUserStore";
import { availabilityStatusStore, requestedStatusStore } from "../Stores/MediaStore";
import { defaultOptions } from "./Notification";

export type SystemNotificationKind = "wave" | "privateMessage" | "knock";

export interface NotifyContext {
    focused: boolean;
    permission: NotificationPermission;
    enabled: boolean;
    doNotDisturb: boolean;
}

/** Pure decision: should a system notification of this kind be shown in this context? */
export function shouldNotify(kind: SystemNotificationKind, context: NotifyContext): boolean {
    if (context.focused || context.permission !== "granted" || !context.enabled) {
        return false;
    }
    // A knock is an explicit request to enter an area: it is the only kind that goes through "do not disturb".
    if (context.doNotDisturb && kind !== "knock") {
        return false;
    }
    return true;
}

export interface SystemNotification {
    kind: SystemNotificationKind;
    title: string;
    body: string;
    /** Avoids stacking notifications from the same source (`wave:<uuid>`, `pm:<uuid>`, `knock:<areaId>:<uuid>`). */
    tag: string;
    onClick?: () => void;
}

/** `renotify` is part of the Notification API but missing from the DOM lib typings of this TypeScript version. */
type RenotifyingNotificationOptions = NotificationOptions & { renotify?: boolean };

/** Reads the real context (focus, permission, user setting, local status) and shows a page notification when allowed. */
export function notifySystem(notification: SystemNotification): void {
    if (typeof Notification === "undefined") {
        return;
    }
    try {
        const context: NotifyContext = {
            focused: document.hasFocus(),
            permission: Notification.permission,
            enabled: localUserStore.getNotification(),
            // The effective status can be JITSI, BBB, SILENT... even when the user asked for "do not disturb",
            // so the requested status counts too.
            doNotDisturb:
                get(requestedStatusStore) === AvailabilityStatus.DO_NOT_DISTURB ||
                get(availabilityStatusStore) === AvailabilityStatus.DO_NOT_DISTURB,
        };
        if (!shouldNotify(notification.kind, context)) {
            return;
        }
        const options: RenotifyingNotificationOptions = {
            ...defaultOptions,
            body: notification.body,
            tag: notification.tag,
            // Notifications sharing a tag replace each other, silently (no banner, no sound) without `renotify`.
            // Waves are already throttled per sender by the WaveManager.
            renotify: true,
        };
        const pageNotification = new Notification(notification.title, options);
        pageNotification.onclick = () => {
            try {
                pageNotification.close();
                window.focus();
                notification.onClick?.();
            } catch (error) {
                console.warn("Error while handling a system notification click", error);
            }
        };
    } catch (error) {
        console.warn("Error while showing a system notification", error);
    }
}
