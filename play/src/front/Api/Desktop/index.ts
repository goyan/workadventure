import { derived, get } from "svelte/store";
import * as Sentry from "@sentry/svelte";
import { AvailabilityStatus, type SpotifyListening } from "@workadventure/messages";
import {
    availabilityStatusStore,
    requestedCameraState,
    requestedMicrophoneState,
    silentStore,
} from "../../Stores/MediaStore";
import type {
    DesktopEnvironmentRequest,
    DesktopAppearance,
    DesktopListening,
    DesktopStatusRequest,
    WorkAdventureDesktopApi,
} from "../../Interfaces/DesktopAppInterfaces";
import { resetAllStatusStoreExcept } from "../../Rules/StatusRules/statusChangerFunctions";
import type { RequestedStatus } from "../../Rules/StatusRules/statusRules";
import { getStatusLabel } from "../../Utils/AvailabilityStatus";
import { isPlayingTrack, listeningSourceOf } from "../../../common/SpotifyListening";
import { listenAlongAvailableStore } from "../../Spotify/ListeningFollower";
import { retroPaletteStore, uiFontStore } from "../../Stores/RetroThemeStore";
import { gameSceneStore } from "../../Stores/GameSceneStore";
import { LL } from "../../../i18n/i18n-svelte";
import { applyDesktopEnvironment, readDesktopEnvironment } from "./EnvironmentControls";

declare global {
    interface Window {
        WAD?: WorkAdventureDesktopApi;
    }
}

/** The statuses a desktop app may ask for: the same choices as the status menu (null = online). */
export const DESKTOP_STATUS_REQUESTS: Record<DesktopStatusRequest, RequestedStatus | null> = {
    online: null,
    busy: AvailabilityStatus.BUSY,
    "do-not-disturb": AvailabilityStatus.DO_NOT_DISTURB,
    "back-in-a-moment": AvailabilityStatus.BACK_IN_A_MOMENT,
};

class DesktopApi {
    isSilent = false;
    private environmentBusy = false;
    private environmentError = "";
    private nextEnvironmentCheck = 0;
    private lastEnvironment = "";

    init() {
        if (!window?.WAD?.desktop) {
            return;
        }

        console.info("Yipee you are using the desktop app ;)");

        window.WAD.onMuteToggle(() => {
            if (this.isSilent) return;
            if (get(requestedMicrophoneState) === true) {
                requestedMicrophoneState.disableMicrophone();
            } else {
                requestedMicrophoneState.enableMicrophone();
            }
        });

        window.WAD.onCameraToggle(() => {
            if (this.isSilent) return;
            if (get(requestedCameraState) === true) {
                requestedCameraState.disableWebcam();
            } else {
                requestedCameraState.enableWebcam();
            }
        });

        // Not unsubscribing is ok, this is a singleton.
        //eslint-disable-next-line svelte/no-ignored-unsubscribe
        silentStore.subscribe((silent) => {
            this.isSilent = silent;
        });

        this.initStatus(window.WAD);
        this.initAppearance(window.WAD);
        if (window.WAD.reportEnvironment) {
            // Singleton subscription; leaving the room releases the scene and disables its desktop controls.
            //eslint-disable-next-line svelte/no-ignored-unsubscribe
            gameSceneStore.subscribe(() => this.reportEnvironment());
            window.WAD.onEnvironmentRequest?.((request) => {
                this.applyEnvironment(request).catch((error: unknown) => Sentry.captureException(error));
            });
        }
        window.WAD.onListenAlongAvailable?.((available) => listenAlongAvailableStore.set(available === true));
    }

    /** Called by the existing game loop: no extra timer and no reference keeping an old room alive. */
    public reportEnvironment(time?: number): void {
        const report = window.WAD?.reportEnvironment;
        if (!report) return;
        if (time !== undefined) {
            if (time < this.nextEnvironmentCheck) return;
            this.nextEnvironmentCheck = time + 1000;
        } else {
            this.nextEnvironmentCheck = 0;
        }
        const state = readDesktopEnvironment(this.environmentBusy, this.environmentError);
        const serialized = JSON.stringify(state);
        if (serialized === this.lastEnvironment) return;
        this.lastEnvironment = serialized;
        report(state);
    }

    private async applyEnvironment(request: DesktopEnvironmentRequest): Promise<void> {
        if (this.environmentBusy) return;
        this.environmentBusy = true;
        this.environmentError = "";
        this.reportEnvironment();
        try {
            await applyDesktopEnvironment(request);
        } catch {
            this.environmentError = get(LL).mapEditor.settings.weather.error();
        } finally {
            this.environmentBusy = false;
            this.reportEnvironment();
        }
    }

    /** What the local user shares, for the desktop app (e.g. its menu bar). Optional: older apps ignore it. */
    reportListening(listening: SpotifyListening) {
        const desktopListening: DesktopListening = {
            title: listening.trackTitle,
            artist: listening.artistName,
            album: listening.albumName,
            url: listening.trackUrl,
            artworkUrl: listening.artworkUrl,
            source: isPlayingTrack(listening) ? listeningSourceOf(listening) : "",
            jamAreaName: listening.jamAreaId === "" ? "" : listening.jamAreaName,
        };
        window.WAD?.reportListening?.(desktopListening);
    }

    /** Optional: older desktop apps keep their own look. */
    private initAppearance(desktop: WorkAdventureDesktopApi) {
        const reportAppearance = desktop.reportAppearance;
        if (!reportAppearance) return;
        const appearance = derived(
            [retroPaletteStore, uiFontStore],
            ([palette, font]): DesktopAppearance => ({ palette, font }),
        );
        // Not unsubscribing is ok, this is a singleton.
        //eslint-disable-next-line svelte/no-ignored-unsubscribe
        appearance.subscribe(reportAppearance);
    }

    /** Optional: older desktop apps provide neither member, and nothing changes for them. */
    private initStatus(desktop: WorkAdventureDesktopApi) {
        desktop.onStatusRequest?.((request) => {
            if (!Object.hasOwn(DESKTOP_STATUS_REQUESTS, request)) return;
            resetAllStatusStoreExcept(DESKTOP_STATUS_REQUESTS[request]);
        });

        const reportStatus = desktop.reportStatus;
        if (!reportStatus) return;
        // Not unsubscribing is ok, this is a singleton.
        //eslint-disable-next-line svelte/no-ignored-unsubscribe
        availabilityStatusStore.subscribe((status) => {
            reportStatus(AvailabilityStatus[status], getStatusLabel(status));
        });
    }
}

export const desktopApi = new DesktopApi();
