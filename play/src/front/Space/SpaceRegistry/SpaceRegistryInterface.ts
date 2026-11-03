import type { FilterType, SpaceKind } from "@workadventure/messages";
import type { Readable } from "svelte/store";
import type { RaisedHandSection, SpaceInterface } from "../SpaceInterface";
import type { VideoBox } from "../VideoBox";
export interface SpaceRegistryInterface {
    getAll(): SpaceInterface[];
    get(spaceName: string): SpaceInterface;
    joinSpace(
        spaceName: string,
        filterType: FilterType,
        propertiesToSync: string[],
        // Note: the signal is compulsory because we should always handle the case where the join is aborted
        signal: AbortSignal,
        options?: {
            metadata?: Map<string, unknown>;
            // True if the user is allowed to start/stop recording in the space. Defaults to false.
            canRecord?: boolean;
            // What the space is, declared to the back; a space that declares nothing is measured as nothing.
            spaceKind?: SpaceKind;
            // Joins a bubble from its edge, to hear it (see Space.listener).
            listener?: boolean;
        },
    ): Promise<SpaceInterface>;
    exist(spaceName: string): boolean;
    leaveSpace(space: SpaceInterface): Promise<void>;
    destroy(): Promise<void>;
    videoStreamStore: Readable<Map<string, VideoBox>>;
    screenShareStreamStore: Readable<Map<string, VideoBox>>;
    /** The bubble members heard from its edge, in the spaces joined as a listener. */
    readonly heardVideoBoxesStore: Readable<VideoBox[]>;
    /** The users at the edge of our bubbles who hear them (spaceUserIds). */
    readonly bubbleListenersStore: Readable<string[]>;
    readonly isLiveStreamingStore: Readable<boolean>;
    readonly isLiveStreamingAudioStore: Readable<boolean>;
    readonly raisedHandSectionsStore: Readable<RaisedHandSection[]>;
    readonly shouldPublishScreenShareStore: Readable<boolean>;
    spacesEligibleForRecording: Readable<SpaceInterface[]>;
    readonly spacesSynchronizingMedia: Readable<SpaceInterface[]>;
}
