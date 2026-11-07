import { FilterType } from "@workadventure/messages";
import { buildJamSpaceName } from "@workadventure/map-editor";
import { get, type Readable, type Writable, writable } from "svelte/store";
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

/** What the user listened to or shared when the page went away: the next page picks it up again. */
export interface JamAudioMemory {
    /** The space of the Jam the user listened to. */
    listening?: string;
    /** The space of the Jam whose music the user shared, and the input it came from. */
    sharing?: { spaceName: string; deviceId: string };
}

export interface JamAudioSessionDependencies {
    getSpaceRegistry: () => Pick<SpaceRegistryInterface, "joinSpace" | "leaveSpace">;
    getRoomUrl: () => string;
    capture: JamMusicCapture;
    getPublisher: (spaceName: string) => JamMusicPublisher | undefined;
    listeningStore: Writable<boolean>;
    /** How long the host waits for the LiveKit connection of the Jam space before trying to share anyway. */
    publisherTimeoutMs?: number;
    /** Where what is listened to or shared is kept between pages; nothing is kept without it. */
    memory?: { load: () => JamAudioMemory; save: (value: JamAudioMemory) => void };
}

/** The inputs that carry the user's own voice: never the music. Without a known microphone, the system default. */
export function forbiddenAudioInputs(micDeviceId: string | undefined): string[] {
    return micDeviceId ? [micDeviceId] : ["default"];
}

export interface JamAudioSession {
    /** The space name of the Jam the user listens to, once joined. */
    readonly listeningSpaceName: Readable<string | undefined>;
    /** The space name of the Jam whose music the user shares, once started. */
    readonly sharingSpaceName: Readable<string | undefined>;
    spaceNameOf(jam: JamAudioTarget): string;
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
    /**
     * Picks up what the user listened to or shared before a restart or a reload, for those of the Jams offered that
     * they were in. Called as the Jams of the room appear: what already runs, or was stopped by the user, is left alone.
     */
    resume(jams: readonly JamAudioTarget[], options?: { micDeviceId?: string }): Promise<void>;
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
    memory,
}: JamAudioSessionDependencies): JamAudioSession {
    let remembered: JamAudioMemory = memory?.load() ?? {};
    function remember(patch: Partial<JamAudioMemory>): void {
        remembered = { ...remembered, ...patch };
        memory?.save(remembered);
    }

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

    const listeningSpaceName = writable<string | undefined>(undefined);
    const sharingSpaceName = writable<string | undefined>(undefined);
    let listenLease: Lease | undefined;

    async function stopListening(): Promise<void> {
        const lease = listenLease;
        listenLease = undefined;
        listeningSpaceName.set(undefined);
        listeningStore.set(false);
        remember({ listening: undefined });
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
            listeningSpaceName.set(lease.spaceName);
            listeningStore.set(true);
            remember({ listening: lease.spaceName });
        }
    }

    let shareLease: Lease | undefined;
    let unwatchCapture: (() => void) | undefined;

    async function stopSharingMusic(): Promise<void> {
        const lease = shareLease;
        shareLease = undefined;
        sharingSpaceName.set(undefined);
        remember({ sharing: undefined });
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
        sharingSpaceName.set(lease.spaceName);
        remember({ sharing: { spaceName: lease.spaceName, deviceId } });
        // A capture that fails or ends by itself (device unplugged, refused) no longer needs the space.
        unwatchCapture = capture.state.subscribe((state) => {
            if (state.status === "error" && shareLease === lease) {
                shareLease = undefined;
                sharingSpaceName.set(undefined);
                // Not asked again: a refused or vanished input would fail the same way at every reload.
                remember({ sharing: undefined });
                const unwatch = unwatchCapture;
                unwatchCapture = undefined;
                queueMicrotask(() => unwatch?.());
                lease.release().catch((error) => console.error("Cannot leave the Jam space", error));
            }
        });
    }

    const resuming = new Set<string>();

    async function resume(jams: readonly JamAudioTarget[], options: { micDeviceId?: string } = {}): Promise<void> {
        const starts: Promise<void>[] = [];
        for (const jam of jams) {
            const spaceName = buildJamSpaceName({ roomUrl: getRoomUrl(), ...jam });
            const wantsListening = remembered.listening === spaceName && get(listeningSpaceName) !== spaceName;
            const sharing = remembered.sharing;
            const wantsSharing = sharing?.spaceName === spaceName && get(sharingSpaceName) !== spaceName;
            for (const [kind, wanted, start] of [
                ["listen", wantsListening, () => listen(jam)],
                [
                    "share",
                    wantsSharing && sharing !== undefined,
                    () =>
                        shareMusic(jam, sharing?.deviceId ?? "", {
                            forbiddenDeviceIds: forbiddenAudioInputs(options.micDeviceId),
                        }),
                ],
            ] as const) {
                const key = `${kind}:${spaceName}`;
                if (!wanted || resuming.has(key)) {
                    continue;
                }
                resuming.add(key);
                starts.push(
                    start()
                        .catch((error) => console.error("Cannot resume the Jam audio", error))
                        .finally(() => resuming.delete(key)),
                );
            }
        }
        await Promise.all(starts);
    }

    return {
        resume,
        listeningSpaceName,
        sharingSpaceName,
        spaceNameOf: (jam) => buildJamSpaceName({ roomUrl: getRoomUrl(), ...jam }),
        listen,
        stopListening,
        shareMusic,
        stopSharingMusic,
    };
}

/** The session of the running game; the space registry and the room belong to the current scene. */
export function createGameJamAudioSession(
    getScene: () => { spaceRegistry: SpaceRegistryInterface; roomUrl: string },
    memory?: JamAudioSessionDependencies["memory"],
): JamAudioSession {
    return createJamAudioSession({
        getSpaceRegistry: () => getScene().spaceRegistry,
        getRoomUrl: () => getScene().roomUrl,
        capture: jamMusicCapture,
        getPublisher: getJamMusicPublisher,
        listeningStore: jamMusicListeningStore,
        memory,
    });
}
