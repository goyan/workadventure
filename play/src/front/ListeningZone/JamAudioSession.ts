import { FilterType } from "@workadventure/messages";
import { buildJamSpaceName } from "@workadventure/map-editor";
import type { Writable } from "svelte/store";
import type { SpaceInterface } from "../Space/SpaceInterface";
import type { SpaceRegistryInterface } from "../Space/SpaceRegistry/SpaceRegistryInterface";
import { jamMusicCapture, type JamMusicCapture } from "./JamMusicCapture";
import { getJamMusicPublisher, jamMusicListeningStore, type JamMusicPublisher } from "./JamMusicStore";

/** The Jam whose media session is asked for: the room is the one the user is in. */
export interface JamAudioTarget {
    areaId: string;
    propertyId: string;
    hostUuid: string;
}

export interface JamAudioSessionDependencies {
    getSpaceRegistry: () => Pick<SpaceRegistryInterface, "joinSpace" | "leaveSpace">;
    getRoomUrl: () => string;
    capture: JamMusicCapture;
    getPublisher: (spaceName: string) => JamMusicPublisher | undefined;
    listeningStore: Writable<boolean>;
    /** How long the host waits for the LiveKit connection of the Jam space before trying to share anyway. */
    publisherTimeoutMs?: number;
}

export interface JamAudioSession {
    /** Joins the Jam space and starts downloading the music of the Jam. Replaces the Jam listened to before. */
    listen(jam: JamAudioTarget): Promise<void>;
    stopListening(): Promise<void>;
    /** Joins the Jam space and shares the chosen input as the music of the Jam (host only: the back checks it). */
    shareMusic(
        jam: JamAudioTarget,
        deviceId: string,
        options?: { forbiddenDeviceIds?: readonly string[] },
    ): Promise<void>;
    stopSharingMusic(): Promise<void>;
}

const PUBLISHER_POLL_MS = 250;
const DEFAULT_PUBLISHER_TIMEOUT_MS = 10_000;

interface Lease {
    spaceName: string;
    /** Resolves once the space is joined; rejects when the join fails. */
    ready: Promise<void>;
    release(): Promise<void>;
}

export function createJamAudioSession({
    getSpaceRegistry,
    getRoomUrl,
    capture,
    getPublisher,
    listeningStore,
    publisherTimeoutMs = DEFAULT_PUBLISHER_TIMEOUT_MS,
}: JamAudioSessionDependencies): JamAudioSession {
    // One Jam space can serve the music of the host, the music a guest hears and, later, the screens: it is joined by the
    // first use and left by the last one.
    const spaces = new Map<string, { uses: number; space: Promise<SpaceInterface>; abort: AbortController }>();

    function acquire(jam: JamAudioTarget): Lease {
        const spaceName = buildJamSpaceName({ roomUrl: getRoomUrl(), ...jam });
        let entry = spaces.get(spaceName);
        if (!entry) {
            const abort = new AbortController();
            const space = getSpaceRegistry().joinSpace(spaceName, FilterType.ALL_USERS, [], abort.signal);
            const created = { uses: 0, space, abort };
            entry = created;
            spaces.set(spaceName, created);
            space.catch(() => {
                if (spaces.get(spaceName) === created) {
                    spaces.delete(spaceName);
                }
            });
        }
        const held = entry;
        held.uses++;
        let released = false;
        return {
            spaceName,
            ready: held.space.then(() => undefined),
            async release() {
                if (released) {
                    return;
                }
                released = true;
                held.uses--;
                if (held.uses > 0) {
                    return;
                }
                if (spaces.get(spaceName) === held) {
                    spaces.delete(spaceName);
                }
                let space: SpaceInterface;
                try {
                    space = await held.space;
                } catch {
                    // The join failed: there is nothing to leave.
                    return;
                }
                await getSpaceRegistry().leaveSpace(space);
            },
        };
    }

    async function waitForPublisher(spaceName: string): Promise<void> {
        let waited = 0;
        while (!getPublisher(spaceName) && waited < publisherTimeoutMs) {
            // eslint-disable-next-line no-await-in-loop -- polls until the connection registers its publisher
            await new Promise<void>((resolve) => {
                setTimeout(resolve, PUBLISHER_POLL_MS);
            });
            waited += PUBLISHER_POLL_MS;
        }
    }

    let listenLease: Lease | undefined;

    async function stopListening(): Promise<void> {
        const lease = listenLease;
        listenLease = undefined;
        listeningStore.set(false);
        await lease?.release();
    }

    async function listen(jam: JamAudioTarget): Promise<void> {
        const spaceName = buildJamSpaceName({ roomUrl: getRoomUrl(), ...jam });
        if (listenLease?.spaceName === spaceName) {
            return;
        }
        const previous = stopListening();
        const lease = acquire(jam);
        listenLease = lease;
        try {
            await lease.ready;
        } catch (error) {
            if (listenLease === lease) {
                listenLease = undefined;
            }
            throw error;
        } finally {
            await previous;
        }
        // Stopped, or moved to another Jam, while joining: this lease is already released.
        if (listenLease === lease) {
            listeningStore.set(true);
        }
    }

    let shareLease: Lease | undefined;
    let unwatchCapture: (() => void) | undefined;

    async function stopSharingMusic(): Promise<void> {
        const lease = shareLease;
        shareLease = undefined;
        unwatchCapture?.();
        unwatchCapture = undefined;
        if (!lease) {
            return;
        }
        await capture.stop();
        await lease.release();
    }

    async function shareMusic(
        jam: JamAudioTarget,
        deviceId: string,
        options?: { forbiddenDeviceIds?: readonly string[] },
    ): Promise<void> {
        await stopSharingMusic();
        const lease = acquire(jam);
        shareLease = lease;
        try {
            await lease.ready;
            await waitForPublisher(lease.spaceName);
            if (shareLease !== lease) {
                return;
            }
            await capture.start(lease.spaceName, deviceId, options);
        } catch (error) {
            if (shareLease === lease) {
                await stopSharingMusic();
            }
            throw error;
        }
        if (shareLease !== lease) {
            return;
        }
        // A capture that fails or ends by itself (device unplugged, refused) no longer needs the space.
        unwatchCapture = capture.state.subscribe((state) => {
            if (state.status === "error" && shareLease === lease) {
                shareLease = undefined;
                const unwatch = unwatchCapture;
                unwatchCapture = undefined;
                queueMicrotask(() => unwatch?.());
                lease.release().catch((error) => console.error("Cannot leave the Jam space", error));
            }
        });
    }

    return { listen, stopListening, shareMusic, stopSharingMusic };
}

/** The session of the running game; the space registry and the room belong to the current scene. */
export function createGameJamAudioSession(
    getScene: () => { spaceRegistry: SpaceRegistryInterface; roomUrl: string },
): JamAudioSession {
    return createJamAudioSession({
        getSpaceRegistry: () => getScene().spaceRegistry,
        getRoomUrl: () => getScene().roomUrl,
        capture: jamMusicCapture,
        getPublisher: getJamMusicPublisher,
        listeningStore: jamMusicListeningStore,
    });
}
