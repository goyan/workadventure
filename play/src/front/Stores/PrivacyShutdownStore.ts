import { get, writable } from "svelte/store";
import { videoStreamElementsStore } from "./PeerStore";
import { isLiveStreamingStore } from "./IsStreamingStore";
import { focusStore } from "./FocusStore";

/**
 * A store that contains "true" if the webcam should be stopped for privacy reasons - i.e. if the user leaves the page while not in a discussion.
 */
function createPrivacyShutdownStore() {
    let privacyEnabled = false;

    const { subscribe, set } = writable(privacyEnabled);

    // It is ok to not unsubscribe to this store because it is a singleton.
    // eslint-disable-next-line svelte/no-ignored-unsubscribe
    focusStore.subscribe((hasFocus) => {
        const peerCount = get(videoStreamElementsStore).length;
        const isLiveStreaming = get(isLiveStreamingStore);

        if (!hasFocus && peerCount === 0 && !isLiveStreaming) {
            privacyEnabled = true;
            set(true);
        }
        if (hasFocus) {
            privacyEnabled = false;
            set(false);
        }
    });

    // It is ok to not unsubscribe to this store because it is a singleton.
    // eslint-disable-next-line svelte/no-ignored-unsubscribe
    videoStreamElementsStore.subscribe((peerElements) => {
        const hasFocus = get(focusStore);
        const isLiveStreaming = get(isLiveStreamingStore);
        if (peerElements.length === 0 && hasFocus === false && !isLiveStreaming) {
            privacyEnabled = true;
            set(true);
        } else if (peerElements.length > 0 && privacyEnabled) {
            // A discussion starts: the camera comes back, even if the window does not have the focus (another
            // window, or the toolbar of the desktop app). Otherwise one joins a call with an empty tile.
            privacyEnabled = false;
            set(false);
        }
    });

    return {
        subscribe,
    };
}

export const privacyShutdownStore = createPrivacyShutdownStore();
