import type { SpotifyListening } from "@workadventure/messages";
import { get, writable, type Writable } from "svelte/store";
import { describe, expect, it } from "vitest";
import { EMPTY_SPOTIFY_LISTENING } from "../../../src/common/SpotifyListening";
import type { SpaceUserExtended } from "../../../src/front/Space/SpaceInterface";
import {
    bindListeningDirectory,
    createListeningByUserUuidStore,
    listeningAlongCountStore,
} from "../../../src/front/Spotify/SpotifyListeningDirectory";

function fakeUser(uuid: string, listening: Writable<SpotifyListening | undefined>): SpaceUserExtended {
    return { uuid, reactiveUser: { spotifyListening: listening } } as unknown as SpaceUserExtended;
}

const track: SpotifyListening = { ...EMPTY_SPOTIFY_LISTENING, trackTitle: "Song", artistName: "Artist" };

describe("createListeningByUserUuidStore", () => {
    it("follows each user's listening, and forgets users who leave or share nothing", () => {
        const aliceListening = writable<SpotifyListening | undefined>(undefined);
        const bobListening = writable<SpotifyListening | undefined>(track);
        const users = writable(
            new Map([
                ["space_1", fakeUser("alice", aliceListening)],
                ["space_2", fakeUser("bob", bobListening)],
            ]),
        );
        const store = createListeningByUserUuidStore(users);
        const unsubscribe = store.subscribe(() => {});

        expect([...get(store).keys()]).toEqual(["bob"]);

        aliceListening.set({ ...EMPTY_SPOTIFY_LISTENING, jamAreaId: "lounge" });
        expect([...get(store).keys()].sort()).toEqual(["alice", "bob"]);

        bobListening.set(EMPTY_SPOTIFY_LISTENING);
        expect([...get(store).keys()]).toEqual(["alice"]);

        users.set(new Map());
        expect(get(store).size).toBe(0);

        unsubscribe();
    });
});

describe("listeningAlongCountStore", () => {
    it("counts who plays along with each user, not someone following themselves", () => {
        const along = (followed: string) =>
            writable<SpotifyListening | undefined>({ ...track, listeningAlongUuid: followed });
        const users = writable(
            new Map([
                ["space_1", fakeUser("nat", writable<SpotifyListening | undefined>(track))],
                ["space_2", fakeUser("amine", along("nat"))],
                ["space_3", fakeUser("antoine", along("nat"))],
                ["space_4", fakeUser("bob", along("bob"))],
            ]),
        );
        const unbind = bindListeningDirectory(users);
        const unsubscribe = listeningAlongCountStore.subscribe(() => {});

        expect(get(listeningAlongCountStore)).toEqual(new Map([["nat", 2]]));

        unsubscribe();
        unbind();
    });
});
