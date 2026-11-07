import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { get, writable } from "svelte/store";
import JamAudioControls from "../../../src/front/Components/ListeningZone/JamAudioControls.svelte";
import type { JamAudioSession } from "../../../src/front/ListeningZone/JamAudioSession";
import type { JamMusicCaptureState } from "../../../src/front/ListeningZone/JamMusicCapture";
import { jamAudioInputStore } from "../../../src/front/ListeningZone/JamAudioInputStore";
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
        resume: vi.fn().mockResolvedValue(undefined),
        leave: vi.fn().mockResolvedValue(undefined),
    };

    beforeEach(() => {
        vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
        listeningSpaceName.set(undefined);
        sharingSpaceName.set(undefined);
        captureState.set({ status: "idle" });
        jamMusicMutedStore.set(false);
        jamMusicVolumeStore.set(1);
        jamAudioInputStore.set("");
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
    // The tooltip listens on the element around the control, as the pointer enters or leaves it.
    const anchorOf = (control: HTMLElement) => control.closest<HTMLElement>('[role="presentation"]') as HTMLElement;
    const q = (id: string) => target.querySelector<HTMLElement>(`[data-testid="${id}"]`);

    describe("guest", () => {
        it("offers to listen, and listens to the Jam on click", async () => {
            await render(false);
            q("jam-audio-listen")?.click();
            expect(listen).toHaveBeenCalledWith(jam);
            expect(q("jam-audio-share")).toBeNull();
        });

        it("shows the volume and the mute only while listening to this Jam", async () => {
            await render(false);
            expect(q("jam-audio-volume")).toBeNull();
            listeningSpaceName.set(spaceName);
            flushSync();
            expect(q("jam-audio-volume")).not.toBeNull();
            expect(q("jam-audio-listen")).toBeNull();
        });

        it("does not own the player: the music must outlive the card, the panel being closed or minimised", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            expect(q("jam-audio-player")).toBeNull();
        });

        it("ignores the listening to another Jam", async () => {
            await render(false);
            listeningSpaceName.set("jam:other");
            flushSync();
            expect(q("jam-audio-volume")).toBeNull();
            expect(q("jam-audio-listen")).not.toBeNull();
        });

        it("lets the listening buttons wrap onto another line instead of overflowing the card", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            const row = q("jam-audio-stop-listen")?.closest(".flex-wrap");
            expect(row).not.toBeNull();
            expect(q("jam-audio-mute")?.closest(".flex-wrap")).toBe(row);
        });

        it("stops listening on click", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            q("jam-audio-stop-listen")?.click();
            expect(stopListening).toHaveBeenCalledTimes(1);
        });

        it("shows the mute as an icon button named in full for screen readers and tooltips", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            const mute = q("jam-audio-mute") as HTMLElement;
            expect(mute.textContent?.trim()).toBe("");
            expect(mute.querySelector("svg")).not.toBeNull();
            expect(mute.getAttribute("aria-label")).toBe("Mute");
            mute.click();
            flushSync();
            expect(mute.getAttribute("aria-label")).toBe("Unmute");
        });

        it("shows stop listening as an icon button with its full name", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            const stop = q("jam-audio-stop-listen") as HTMLElement;
            expect(stop.textContent?.trim()).toBe("");
            expect(stop.querySelector("svg")).not.toBeNull();
            expect(stop.getAttribute("aria-label")).toBe("Stop listening");
        });

        it("names an icon button in a tooltip shown on hover and on keyboard focus", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
            const mute = q("jam-audio-mute") as HTMLElement;
            anchorOf(mute).dispatchEvent(new MouseEvent("mouseenter"));
            await vi.waitFor(() =>
                expect(document.body.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe("Mute"),
            );
            anchorOf(mute).dispatchEvent(new MouseEvent("mouseleave"));
            await vi.waitFor(() => expect(document.body.querySelector('[role="tooltip"]')).toBeNull());
            const stop = q("jam-audio-stop-listen") as HTMLElement;
            stop.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
            await vi.waitFor(() =>
                expect(document.body.querySelector('[role="tooltip"]')?.textContent?.trim()).toBe("Stop listening"),
            );
        });

        it("draws the tooltip outside the card, so that the scrolling panel around it cannot cut it", async () => {
            await render(false);
            listeningSpaceName.set(spaceName);
            flushSync();
            anchorOf(q("jam-audio-mute") as HTMLElement).dispatchEvent(new MouseEvent("mouseenter"));
            await vi.waitFor(() => expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull());
            const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]') as HTMLElement;
            expect(target.contains(tooltip)).toBe(false);
            expect(tooltip.parentElement).toBe(document.body);
            expect(tooltip.style.position).toBe("fixed");
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

        it("remembers the chosen input when the card is rebuilt, as after a server restart", async () => {
            await render(true, "mic");
            const select = q("jam-audio-input") as HTMLSelectElement;
            await vi.waitFor(() => expect(select.options.length).toBe(2));
            select.value = "bh";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
            const first = component;
            component = undefined;
            if (first) await unmount(first);
            target.replaceChildren();
            await render(true, "mic");
            const rebuilt = q("jam-audio-input") as HTMLSelectElement;
            await vi.waitFor(() => expect(rebuilt.options.length).toBe(2));
            expect(rebuilt.value).toBe("bh");
            expect((q("jam-audio-share") as HTMLButtonElement).disabled).toBe(false);
        });

        it("keeps the chosen input in the browser, where the installed app and a tab of the profile find it", async () => {
            await render(true, "mic");
            const select = q("jam-audio-input") as HTMLSelectElement;
            await vi.waitFor(() => expect(select.options.length).toBe(2));
            select.value = "bh";
            select.dispatchEvent(new Event("change", { bubbles: true }));
            flushSync();
            expect(localStorage.getItem("jamAudioInputDeviceId")).toBe("bh");
        });

        it("forgets a remembered input that is not there any more", async () => {
            jamAudioInputStore.set("unplugged");
            await render(true, "mic");
            const select = q("jam-audio-input") as HTMLSelectElement;
            await vi.waitFor(() => expect(select.options.length).toBe(2));
            expect((q("jam-audio-share") as HTMLButtonElement).disabled).toBe(true);
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
