import type { SpotifyListening } from "@workadventure/messages";
import { derived, type Readable, readable, type Unsubscriber, writable } from "svelte/store";
import { isInJam, isPlayingTrack } from "../../common/SpotifyListening";
import type { SpaceUserExtended } from "../Space/SpaceInterface";

export type ListeningByUserUuid = ReadonlyMap<string, SpotifyListening>;

/**
 * What every connected user shares (a track, a Jam or both), by user UUID. Users who share nothing are absent.
 *
 * A field update does not re-emit the space's user list: each user's reactive `spotifyListening` is followed.
 */
export function createListeningByUserUuidStore(
    usersStore: Readable<Map<string, SpaceUserExtended>>,
): Readable<ListeningByUserUuid> {
    return readable<ListeningByUserUuid>(new Map(), (set) => {
        const listeningBySpaceUserId = new Map<string, { uuid: string; listening: SpotifyListening | undefined }>();
        const userUnsubscribers = new Map<string, Unsubscriber>();

        const emit = () => {
            const byUuid = new Map<string, SpotifyListening>();
            for (const { uuid, listening } of listeningBySpaceUserId.values()) {
                if (isPlayingTrack(listening) || isInJam(listening)) {
                    byUuid.set(uuid, listening);
                }
            }
            set(byUuid);
        };

        const unsubscribeUsers = usersStore.subscribe((users) => {
            for (const [spaceUserId, unsubscribe] of userUnsubscribers) {
                if (!users.has(spaceUserId)) {
                    unsubscribe();
                    userUnsubscribers.delete(spaceUserId);
                    listeningBySpaceUserId.delete(spaceUserId);
                }
            }
            for (const [spaceUserId, user] of users) {
                if (userUnsubscribers.has(spaceUserId)) {
                    continue;
                }
                userUnsubscribers.set(
                    spaceUserId,
                    user.reactiveUser.spotifyListening.subscribe((listening) => {
                        listeningBySpaceUserId.set(spaceUserId, { uuid: user.uuid, listening });
                        emit();
                    }),
                );
            }
            emit();
        });

        return () => {
            unsubscribeUsers();
            for (const unsubscribe of userUnsubscribers.values()) {
                unsubscribe();
            }
        };
    });
}

/**
 * Bound to the world space of the current room by the GameScene; empty until then.
 */
const listeningSource = writable<Readable<ListeningByUserUuid>>(readable(new Map()));

export const listeningByUserUuidStore: Readable<ListeningByUserUuid> = readable<ListeningByUserUuid>(
    new Map(),
    (set) => {
        let unsubscribeInner: Unsubscriber | undefined;
        const unsubscribeSource = listeningSource.subscribe((source) => {
            unsubscribeInner?.();
            unsubscribeInner = source.subscribe(set);
        });
        return () => {
            unsubscribeSource();
            unsubscribeInner?.();
        };
    },
);

/** How many users play along with each user ("Écouter en même temps", home Jams included), by the followed uuid. */
export const listeningAlongCountStore: Readable<Map<string, number>> = derived(listeningByUserUuidStore, (byUuid) => {
    const counts = new Map<string, number>();
    for (const [uuid, listening] of byUuid) {
        const followed = listening.listeningAlongUuid;
        if (followed !== "" && followed !== uuid) {
            counts.set(followed, (counts.get(followed) ?? 0) + 1);
        }
    }
    return counts;
});

export function bindListeningDirectory(usersStore: Readable<Map<string, SpaceUserExtended>>): () => void {
    listeningSource.set(createListeningByUserUuidStore(usersStore));
    return () => listeningSource.set(readable(new Map()));
}
