import { get } from "svelte/store";
import { AvailabilityStatus } from "@workadventure/messages";
import { localUserStore } from "../Connection/LocalUserStore";
import { availabilityStatusStore } from "../Stores/MediaStore";
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
            doNotDisturb: get(availabilityStatusStore) === AvailabilityStatus.DO_NOT_DISTURB,
        };
        if (!shouldNotify(notification.kind, context)) {
            return;
        }
        const pageNotification = new Notification(notification.title, {
            ...defaultOptions,
            body: notification.body,
            tag: notification.tag,
        });
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
