import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "svelte/store";
import type { Writable } from "svelte/store";
import { MapStore } from "@workadventure/store-utils";
import { mock } from "vitest-mock-extended";
import type { GameScene } from "../Phaser/Game/GameScene";
import type { Player } from "../Phaser/Player/Player";
import type { RemotePlayer } from "../Phaser/Entity/RemotePlayer";
import type { VideoBox } from "../Space/VideoBox";
import type { SpaceUserExtended } from "../Space/SpaceInterface";

vi.mock("./GameSceneStore", async () => {
    const { writable } = await import("svelte/store");
    return { gameSceneStore: writable<GameScene | undefined>(undefined), gameSceneIsLoadedStore: writable(true) };
});
vi.mock("./StreamableCollectionStore", async () => {
    const { writable } = await import("svelte/store");
    return { streamableCollectionStore: writable(new Map<string, VideoBox>()) };
});
vi.mock("./PeerStore", async () => {
    const { writable } = await import("svelte/store");
    return { activePictureInPictureStore: writable(false) };
});
vi.mock("./HighlightedEmbedScreenStore", async () => {
    const { writable } = await import("svelte/store");
    return { highlightedEmbedScreen: writable<VideoBox | undefined>(undefined) };
});
vi.mock("./ActionsCamStore", async () => {
    const { writable } = await import("svelte/store");
    return { highlightFullScreen: writable(false) };
});
vi.mock("./MyMediaStore", async () => {
    const { writable } = await import("svelte/store");
    return { inExternalServiceStore: writable(false) };
});
vi.mock("../Connection/LocalUserStore", () => ({ localUserStore: { getAvatarVideosEnabled: () => true } }));
vi.mock("./BubbleListeningStore", () => ({ userIdOfSpaceUser: () => 7 }));

import { gameSceneStore } from "./GameSceneStore";
import { activePictureInPictureStore } from "./PeerStore";
import { avatarVideoBoxIdsStore, avatarVideoEntriesStore, avatarVideosEnabledStore } from "./AvatarVideoStore";

const { streamableCollectionStore } = await vi.importMock<{
    streamableCollectionStore: Writable<Map<string, VideoBox>>;
}>("./StreamableCollectionStore");

function camera(id: string, uuid: string): VideoBox {
    return Object.assign(mock<VideoBox>(), {
        uniqueId: id,
        spaceUser: Object.assign(mock<SpaceUserExtended>(), { spaceUserId: id, uuid }),
    });
}

describe("avatar video placement", () => {
    const players = new MapStore<number, RemotePlayer>();
    const currentPlayer = mock<Player>();
    const remote = mock<RemotePlayer>({ userUuid: "alice" });
    const scene = mock<GameScene>();
    scene.CurrentPlayer = currentPlayer;
    scene.MapPlayersByKey = players;

    beforeEach(() => {
        players.clear();
        players.set(7, remote);
        gameSceneStore.set(scene);
        streamableCollectionStore.set(new Map());
        activePictureInPictureStore.set(false);
        avatarVideosEnabledStore.set(true);
    });

    it("anchors cameras to the matching avatar and keeps screen shares in the classic layout", () => {
        const local = camera("-1", "local");
        const alice = camera("room_7", "alice");
        const screenShare = Object.assign(mock<VideoBox>(), {
            uniqueId: "screensharing_room_7",
            spaceUser: alice.spaceUser,
        });
        streamableCollectionStore.set(new Map([local, alice, screenShare].map((box) => [box.uniqueId, box])));
        expect(get(avatarVideoEntriesStore).map((entry) => entry.character)).toEqual([currentPlayer, remote]);
        expect(get(avatarVideoBoxIdsStore)).toEqual(new Set(["-1", "room_7"]));
    });

    it("does not attach a participant from another room to an unrelated avatar with the same numeric id", () => {
        const otherRoom = camera("other-room_7", "bob");
        streamableCollectionStore.set(new Map([[otherRoom.uniqueId, otherRoom]]));
        expect(get(avatarVideoEntriesStore)).toEqual([]);
    });

    it("restores the classic layout immediately when disabled, and restores bubbles when re-enabled", () => {
        const alice = camera("room_7", "alice");
        streamableCollectionStore.set(new Map([[alice.uniqueId, alice]]));
        avatarVideosEnabledStore.set(false);
        expect(get(avatarVideoBoxIdsStore).size).toBe(0);
        avatarVideosEnabledStore.set(true);
        expect(get(avatarVideoBoxIdsStore).has(alice.uniqueId)).toBe(true);
    });

    it("keeps picture-in-picture videos in the picture-in-picture layout", () => {
        const alice = camera("room_7", "alice");
        streamableCollectionStore.set(new Map([[alice.uniqueId, alice]]));
        activePictureInPictureStore.set(true);
        expect(get(avatarVideoEntriesStore)).toEqual([]);
    });

    it("removes the anchor when the avatar leaves the map", () => {
        const alice = camera("room_7", "alice");
        streamableCollectionStore.set(new Map([[alice.uniqueId, alice]]));
        const unsubscribe = avatarVideoEntriesStore.subscribe(() => undefined);
        players.delete(7);
        expect(get(avatarVideoEntriesStore)).toEqual([]);
        unsubscribe();
    });
});
