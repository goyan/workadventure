import { writable } from "svelte/store";
import { localUserStore } from "../Connection/LocalUserStore";

function createJamAudioInputStore() {
    const { subscribe, set } = writable<string>(localUserStore.getJamAudioInputDeviceId() ?? "");
    return {
        subscribe,
        set(deviceId: string) {
            localUserStore.setJamAudioInputDeviceId(deviceId);
            set(deviceId);
        },
    };
}

/**
 * The audio input the user shares the music of their Jam from, kept in the browser like the other device choices
 * (installed app and browser tab of the same profile share it). It outlives the card of the Jam: a server restart
 * rebuilds the list of rooms, and the user should not pick BlackHole again each time.
 */
export const jamAudioInputStore = createJamAudioInputStore();
