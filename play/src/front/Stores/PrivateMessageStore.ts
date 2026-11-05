import { get, writable } from "svelte/store";
import { z } from "zod";
import * as Sentry from "@sentry/svelte";
import { privateMessageSchema } from "@workadventure/shared-utils";
import { blackListManager } from "../WebRtc/BlackListManager";

const historyLimit = 100;
const historyStorageKey = "workadventure.private-message-history.v1";
const privateMessageEntrySchema = z.object({
    id: z.number().int().positive(),
    peerUuid: privateMessageSchema.shape.sender.shape.uuid,
    peerName: privateMessageSchema.shape.sender.shape.name,
    text: privateMessageSchema.shape.text,
    incoming: z.boolean(),
    timestamp: z.number().int().nonnegative(),
});
const savedHistorySchema = z
    .array(privateMessageEntrySchema.extend({ userUuid: z.string().min(1), roomUrl: z.string().min(1) }))
    .max(historyLimit);

export type PrivateMessageEntry = z.infer<typeof privateMessageEntrySchema>;
type PrivateMessageInput = Omit<PrivateMessageEntry, "id" | "timestamp">;
type PrivateMessageSession = { userUuid: string | undefined; roomUrl: string };

export const privateMessageHistoryStore = writable<PrivateMessageEntry[]>([]);
export const privateMessageNotificationStore = writable<PrivateMessageEntry | undefined>();
let sequence = 0;
let deletionGeneration = 0;
let session: PrivateMessageSession | undefined;

function readSavedHistory(): z.infer<typeof savedHistorySchema> | undefined {
    try {
        const saved = localStorage.getItem(historyStorageKey);
        if (!saved) return [];
        const result = savedHistorySchema.safeParse(JSON.parse(saved));
        return result.success ? result.data : [];
    } catch {
        // Storage can be disabled or full. Never include private contents in diagnostics.
        Sentry.addBreadcrumb({
            category: "private-message-history",
            level: "warning",
            message: "Storage read unavailable",
        });
        return undefined;
    }
}

/** Restore only the connected identity and room. Closing a connection clears memory, not the saved messages. */
export function restorePrivateMessages(userUuid: string | undefined, roomUrl: string): () => void {
    clearPrivateMessages();
    const currentSession = { userUuid, roomUrl };
    session = currentSession;
    const saved = userUuid ? (readSavedHistory() ?? []) : [];
    sequence = Math.max(sequence, ...saved.map((entry) => entry.id));
    privateMessageHistoryStore.set(
        saved
            .filter((entry) => entry.userUuid === userUuid && entry.roomUrl === roomUrl)
            .map((entry) => ({
                id: entry.id,
                peerUuid: entry.peerUuid,
                peerName: entry.peerName,
                text: entry.text,
                incoming: entry.incoming,
                timestamp: entry.timestamp,
            })),
    );
    return () => {
        if (session === currentSession) clearPrivateMessages();
    };
}

export function recordPrivateMessage(message: PrivateMessageInput): void {
    const saved = session?.userUuid ? (readSavedHistory() ?? []) : [];
    sequence = Math.max(sequence, ...saved.map((entry) => entry.id));
    const entry = { ...message, id: ++sequence, timestamp: Date.now() };
    privateMessageHistoryStore.update((messages) => [...messages, entry].slice(-historyLimit));
    if (session?.userUuid) {
        try {
            localStorage.setItem(
                historyStorageKey,
                JSON.stringify(
                    [...saved, { ...entry, userUuid: session.userUuid, roomUrl: session.roomUrl }].slice(-historyLimit),
                ),
            );
        } catch {
            Sentry.addBreadcrumb({
                category: "private-message-history",
                level: "warning",
                message: "Storage write unavailable",
            });
        }
    }
    if (entry.incoming) privateMessageNotificationStore.set(entry);
}

/** An ACK from an old connection must not enter another account's or room's history. */
export function getPrivateMessageRecorder(): (message: PrivateMessageInput) => void {
    const currentSession = session;
    return (message) => {
        if (session === currentSession) recordPrivateMessage(message);
    };
}

/** Capture the session so a delayed confirmation cannot erase another account's history. */
export function getPrivateMessageDeleter(peerUuid: string): (id?: number) => void {
    const currentSession = session;
    const currentGeneration = deletionGeneration;
    return (id) => {
        if (session !== currentSession || deletionGeneration !== currentGeneration) return;
        const matches = (entry: PrivateMessageEntry): boolean =>
            entry.peerUuid === peerUuid && (id === undefined || entry.id === id);
        if (!get(privateMessageHistoryStore).some(matches)) return;
        privateMessageHistoryStore.update((messages) => messages.filter((entry) => !matches(entry)));
        const notification = get(privateMessageNotificationStore);
        if (notification && matches(notification)) privateMessageNotificationStore.set(undefined);
        if (!currentSession?.userUuid) return;
        const saved = readSavedHistory();
        if (!saved) return;
        try {
            localStorage.setItem(
                historyStorageKey,
                JSON.stringify(
                    saved.filter(
                        (entry) =>
                            entry.userUuid !== currentSession.userUuid ||
                            entry.roomUrl !== currentSession.roomUrl ||
                            !matches(entry),
                    ),
                ),
            );
        } catch {
            Sentry.addBreadcrumb({
                category: "private-message-history",
                level: "warning",
                message: "Storage write unavailable",
            });
        }
    };
}

/** Private payloads are consumed before the general event stream reaches map scripts. */
export function receivePrivateMessage(data: unknown, roomUrl?: string, userUuid?: string): void {
    if (roomUrl !== undefined && (session?.roomUrl !== roomUrl || session.userUuid !== userUuid)) return;
    const result = privateMessageSchema.safeParse(data);
    if (!result.success || blackListManager.isBlackListed(result.data.sender.uuid)) return;
    if (session?.userUuid && result.data.recipientUuid !== session.userUuid) return;
    recordPrivateMessage({
        peerUuid: result.data.sender.uuid,
        peerName: result.data.sender.name,
        text: result.data.text,
        incoming: true,
    });
}

export function clearPrivateMessages(): void {
    deletionGeneration++;
    session = undefined;
    privateMessageHistoryStore.set([]);
    privateMessageNotificationStore.set(undefined);
}
