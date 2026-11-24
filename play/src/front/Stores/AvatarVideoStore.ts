import { derived, writable } from "svelte/store";
import type { Readable } from "svelte/store";
import type { GameScene } from "../Phaser/Game/GameScene";
import type { Character } from "../Phaser/Entity/Character";
import { localUserStore } from "../Connection/LocalUserStore";
import { gameSceneIsLoadedStore, gameSceneStore } from "./GameSceneStore";
import { streamableCollectionStore } from "./StreamableCollectionStore";
import { activePictureInPictureStore } from "./PeerStore";
import { highlightedEmbedScreen } from "./HighlightedEmbedScreenStore";
import { highlightFullScreen } from "./ActionsCamStore";
import { inExternalServiceStore } from "./MyMediaStore";
import { userIdOfSpaceUser } from "./BubbleListeningStore";
import { offscreenCallUsersStore } from "./CallStripStore";

export const avatarVideosEnabledStore = writable(localUserStore.getAvatarVideosEnabled());

const sceneWithPlayersStore = derived<Readable<GameScene | undefined>, GameScene | undefined>(
    gameSceneStore,
    (scene, set) => {
        set(scene);
        return scene?.MapPlayersByKey.subscribe(() => set(scene));
    },
);

export const avatarVideoEntriesStore = derived(
    [
        sceneWithPlayersStore,
        streamableCollectionStore,
        activePictureInPictureStore,
        highlightedEmbedScreen,
        highlightFullScreen,
        inExternalServiceStore,
        gameSceneIsLoadedStore,
        avatarVideosEnabledStore,
        offscreenCallUsersStore,
    ],
    ([scene, boxes, inPictureInPicture, highlight, fullScreen, externalService, loaded, enabled, offscreen]) => {
        if (!enabled || !scene || !loaded || inPictureInPicture || highlight || fullScreen || externalService)
            return [];
        // Looking away from the call (the own avatar out of the view): every video goes back to a full tile.
        if (offscreen.has("local")) return [];
        return Array.from(boxes.values()).flatMap((videoBox) => {
            let character: Character | undefined;
            if (videoBox.uniqueId === "-1") {
                character = scene.CurrentPlayer;
            } else if (videoBox.uniqueId === videoBox.spaceUser.spaceUserId) {
                const remote = scene.MapPlayersByKey.get(userIdOfSpaceUser(videoBox.spaceUser.spaceUserId));
                // User ids are local to a room; a remote meeting participant can have the same numeric id.
                if (remote?.userUuid === videoBox.spaceUser.uuid) character = remote;
            }
            return character ? [{ videoBox, character }] : [];
        });
    },
);

export const avatarVideoBoxIdsStore = derived(
    avatarVideoEntriesStore,
    (entries) => new Set(entries.map(({ videoBox }) => videoBox.uniqueId)),
);
