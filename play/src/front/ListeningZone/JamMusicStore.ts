import { writable } from "svelte/store";

/** Whether the local user chose to hear the music of the Jam they joined: the music is only downloaded then. */
export const jamMusicListeningStore = writable(false);

/** The music each Jam space relays, by space name: one stream at most, its host's. */
export const jamMusicStreamsStore = writable<ReadonlyMap<string, MediaStream>>(new Map());

export function setJamMusicStream(spaceName: string, stream: MediaStream | undefined): void {
    jamMusicStreamsStore.update((streams) => {
        const next = new Map(streams);
        if (stream) {
            next.set(spaceName, stream);
        } else {
            next.delete(spaceName);
        }
        return next;
    });
}

/** The volume of the music alone, between 0 and 1: the voices and the audio of the screens keep their own. */
export const jamMusicVolumeStore = writable(1);

/** Whether the local user silenced the music while staying in the Jam. */
export const jamMusicMutedStore = writable(false);
