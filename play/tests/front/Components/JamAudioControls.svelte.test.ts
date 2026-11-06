import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, writable } from "svelte/store";
import JamAudioControls from "../../../src/front/Components/ListeningZone/JamAudioControls.svelte";
import type { JamAudioSession } from "../../../src/front/ListeningZone/JamAudioSession";
import type { JamMusicCaptureState } from "../../../src/front/ListeningZone/JamMusicCapture";
import { jamMusicMutedStore, jamMusicVolumeStore } from "../../../src/front/ListeningZone/JamMusicStore";

vi.mock("../../../src/i18n/i18n-svelte", async () => {
    const { readable } = await import("svelte/store");
    const label = (text: string) => () => text;
    return {
        LL: readable({
            spotify: {
                listeningZone: {
                    audioShare: label("Share audio"),
                    audioStopShare: label("Stop audio"),
                    audioInput: label("Audio input"),
                    audioHint: label("hint"),
                    audioListen: label("Listen"),
                    audioStopListen: label("Stop listening"),
                    audioVolume: label("Volume"),
                    audioMute: label("Mute"),
                    audioUnmute: label("Unmute"),
                    audioErrorDenied: label("denied"),
                    audioErrorDevice: label("device"),
                    audioErrorMicrophone: label("microphone"),
                    audioErrorSession: label("session"),
                },
            },
        }),
    };
});
const jam = { areaId: "a", propertyId: "p", hostUuid: "h" };
const spaceName = "jam:space";

describe("JamAudioControls", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    const listeningSpaceName = writable<string | undefined>(undefined);
    const sharingSpaceName = writable<string | undefined>(undefined);
    const captureState = writable<JamMusicCaptureState>({ status: "idle" });
    const listen = vi.fn().mockResolvedValue(undefined);
    const stopListening = vi.fn().mockResolvedValue(undefined);
    const shareMusic = vi.fn().mockResolvedValue(undefined);
    const stopSharingMusic = vi.fn().mockResolvedValue(undefined);
    const session: JamAudioSession = {
        listeningSpaceName,
        sharingSpaceName,
        spaceNameOf: () => spaceName,
        listen,
        stopListening,
        shareMusic,
        stopSharingMusic,
    };

    beforeEach(() => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        listeningSpaceName.set(undefined);
        sharingSpaceName.set(undefined);
        captureState.set({ status: "idle" });
        jamMusicMutedStore.set(false);
        jamMusicVolumeStore.set(1);
        listen.mockClear();
        stopListening.mockClear();
        shareMusic.mockClear();
        stopSharingMusic.mockClear();
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: {
                enumerateDevices: vi.fn().mockResolvedValue([
                    { kind: "audioinput", deviceId: "mic", label: "Micro" },
                    { kind: "audioinput", deviceId: "bh", label: "BlackHole 2ch" },
                    { kind: "audiooutput", deviceId: "spk", label: "Haut-parleurs" },
                ]),
            },
        });
        target = document.createElement("div");
        document.body.appendChild(target);
    });

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target.remove();
        vi.restoreAllMocks();
    });

    async function render(mine: boolean, micDeviceId: string | undefined = "mic") {
        component = mount(JamAudioControls, { target, props: { jam, mine, session, micDeviceId, captureState } });
        flushSync();
        await vi.waitFor(() => expect(target.querySelector("[data-testid]")).not.toBeNull());
        flushSync();
    }
    const q = (id: string) => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

    describe("guest", () => {
        it("offers to listen, and listens to the Jam on click", async () => {
            await render(false);
            q("jam-audio-listen")?.click();
            expect(listen).toHaveBeenCalledWith(jam);
            expect(q("jam-audio-share")).toBeNull();
        });

        it("shows the volume, the mute and the player only while listening to this Jam", async () => {
            await render(false);
            expect(q("jam-audio-volume")).toBeNull();
            expect(q("jam-audio-player")).toBeNull();
            listeningSpaceName.set(spaceName);
            flushSync();
            expect(q("jam-audio-volume")).not.toBeNull();
            expect(q("jam-audio-player")).not.toBeNull();
            expect(q("jam-audio-listen")).toBeNull();
        });

        it("ignores the listening to another Jam", async () => {
            await render(false);
            listeningSpaceName.set("jam:other");
            flushSync();
            expect(q("jam-audio-player")).toBeNull();
            expect(q("jam-audio-listen")).not.toBeNull();
        });

        it("lets the listening buttons wrap onto another line instead of overflowing the card", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            const row = q("jam-audio-stop-listen")?.parentElement;
            expect(row?.classList.contains("flex-wrap")).toBe(true);
            expect(q("jam-audio-mute")?.parentElement).toBe(row);
        });

        it("stops listening on click", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            q("jam-audio-stop-listen")?.click();
            expect(stopListening).toHaveBeenCalledTimes(1);
        });

        it("mutes and unmutes the music alone", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            q("jam-audio-mute")?.click();
            flushSync();
            expect(get(jamMusicMutedStore)).toBe(true);
            q("jam-audio-mute")?.click();
            flushSync();
            expect(get(jamMusicMutedStore)).toBe(false);
        });
    });

    describe("host", () => {
        it("lists the audio inputs and shares the chosen one, forbidding the microphone", async () => {
            await render(true, "mic");
            const select = q("jam-audio-input") as HTMLSelectElement;
            await vi.waitFor(() => expect(select.options.length).toBe(2));
            select.value = "bh";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
            q("jam-audio-share")?.click();
            expect(shareMusic).toHaveBeenCalledWith(jam, "bh", { forbiddenDeviceIds: ["mic"] });
        });

        it("cannot share before an input is chosen", async () => {
            await render(true);
            const share = q("jam-audio-share") as HTMLButtonElement;
            expect(share.disabled).toBe(true);
        });

        it("stops sharing while sharing this Jam", async () => {
            await render(true);
            sharingSpaceName.set(spaceName);
            flushSync();
            q("jam-audio-stop-share")?.click();
            expect(stopSharingMusic).toHaveBeenCalledTimes(1);
            expect(q("jam-audio-share")).toBeNull();
        });

        it("tells why the capture failed", async () => {
            await render(true);
            captureState.set({ status: "error", reason: "microphone" });
            flushSync();
            expect(q("jam-audio-error")?.textContent).toContain("microphone");
        });
    });
});
