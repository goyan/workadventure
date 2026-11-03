import { derived, writable } from "svelte/store";
import { ForwardableStore } from "@workadventure/store-utils";
import { localUserStore } from "../Connection/LocalUserStore";
import type { VideoBox } from "../Space/VideoBox";
import type { RaisedHandSection, SpaceInterface } from "../Space/SpaceInterface";

export const videoStreamStore = new ForwardableStore<Map<string, VideoBox>>(new Map<string, VideoBox>());
export const screenShareStreamStore = new ForwardableStore<Map<string, VideoBox>>(new Map<string, VideoBox>());

// The raised hands and floor holders of each space, one section per space (SpaceRegistry.raisedHandSectionsStore).
// Sourced from the space state, so they reach every participant — even a megaphone speaker without seeAttendees.
export const raisedHandSectionsStore = new ForwardableStore<RaisedHandSection[]>([]);

// Spaces the local user syncs their media with (SpaceRegistry.spacesSynchronizingMedia): where a hand can be raised.
export const mediaSynchronizedSpacesStore = new ForwardableStore<SpaceInterface[]>([]);

// The bubble members heard from its edge (SpaceRegistry.heardVideoBoxesStore): their voice only, at a low volume.
export const heardVideoBoxesStore = new ForwardableStore<VideoBox[]>([]);

// The users at the edge of our bubble who hear it (SpaceRegistry.bubbleListenersStore), by spaceUserId.
export const bubbleListenersStore = new ForwardableStore<string[]>([]);

export const videoStreamElementsStore = derived(videoStreamStore, ($videoStreamStore) => {
    return Array.from($videoStreamStore.values());
});

export const screenShareStreamElementsStore = derived(screenShareStreamStore, ($screenShareStreamStore) => {
    return Array.from($screenShareStreamStore.values());
});

export const volumeProximityDiscussionStore = writable(localUserStore.getVolumeProximityDiscussion());

export const activePictureInPictureStore = writable(false);
export const askPictureInPictureActivatingStore = writable(false);
export const pictureInPictureSupportedStore = writable(true);
