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
