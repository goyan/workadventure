import { writable } from "svelte/store";
import { privateMessageSchema } from "@workadventure/shared-utils";
import { blackListManager } from "../WebRtc/BlackListManager";

export interface PrivateMessageEntry {
    id: number;
    peerUuid: string;
    peerName: string;
    text: string;
    incoming: boolean;
}

export const privateMessageHistoryStore = writable<PrivateMessageEntry[]>([]);
export const privateMessageNotificationStore = writable<PrivateMessageEntry | undefined>();
let sequence = 0;

export function recordPrivateMessage(message: Omit<PrivateMessageEntry, "id">): void {
    const entry = { ...message, id: ++sequence };
    privateMessageHistoryStore.update((messages) => [...messages, entry].slice(-100));
    if (entry.incoming) privateMessageNotificationStore.set(entry);
}

/** Private payloads are consumed before the general event stream reaches map scripts. */
export function receivePrivateMessage(data: unknown): void {
    const result = privateMessageSchema.safeParse(data);
    if (!result.success || blackListManager.isBlackListed(result.data.sender.uuid)) return;
    recordPrivateMessage({
        peerUuid: result.data.sender.uuid,
        peerName: result.data.sender.name,
        text: result.data.text,
        incoming: true,
    });
}

export function clearPrivateMessages(): void {
    privateMessageHistoryStore.set([]);
    privateMessageNotificationStore.set(undefined);
}
