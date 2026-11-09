import { afterEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { writable } from "svelte/store";
import JamAudioResume from "../../../src/front/Components/ListeningZone/JamAudioResume.svelte";
import type { JamAudioSession } from "../../../src/front/ListeningZone/JamAudioSession";
import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";

function room(hostUuid: string, kind: "spotify" | "home" = "spotify"): JamRoom {
    return {
        zone: { areaId: "area", propertyId: "prop", areaName: "JAM" },
        jam: { hostUuid, hostName: "H", ...(kind === "home" && { home: true }) },
    } as unknown as JamRoom;
}

describe("JamAudioResume", () => {
    let target: HTMLElement;
    let component: ReturnType<typeof mount> | undefined;
    const rooms = writable<JamRoom[]>([]);
    const micDeviceId = writable<string | undefined>("mic");
    const resume = vi.fn().mockResolvedValue(undefined);
    const session = { resume } as unknown as JamAudioSession;

    afterEach(async () => {
        const mounted = component;
        component = undefined;
        if (mounted) await unmount(mounted);
        target?.remove();
        rooms.set([]);
        micDeviceId.set("mic");
        resume.mockClear();
    });

    function render() {
        target = document.createElement("div");
        document.body.appendChild(target);
        component = mount(JamAudioResume, { target, props: { session, rooms, micDeviceId } });
        flushSync();
    }

    it("offers the Jams of the room to the session as they appear, with the microphone to keep out", () => {
        render();
        rooms.set([room("h1")]);
        flushSync();
        expect(resume).toHaveBeenLastCalledWith([{ areaId: "area", propertyId: "prop", hostUuid: "h1" }], {
            micDeviceId: "mic",
        });
    });

    it("resumes a Live room through the existing music session", () => {
        render();
        rooms.set([
            {
                zone: { areaId: "area", propertyId: "prop", areaName: "JAM" },
                jam: { live: true, hostUuid: "max", hostName: "Max" },
            },
        ]);
        flushSync();
        expect(resume).toHaveBeenLastCalledWith([{ areaId: "area", propertyId: "prop", hostUuid: "max" }], {
            micDeviceId: "mic",
        });
    });

    it("leaves the Jukeboxes out: their music is not carried by the media session", () => {
        render();
        rooms.set([room("h1"), room("h2", "home")]);
        flushSync();
        expect(resume).toHaveBeenLastCalledWith([{ areaId: "area", propertyId: "prop", hostUuid: "h1" }], {
            micDeviceId: "mic",
        });
    });

    it("offers them again when a Jam comes back after a restart", () => {
        render();
        rooms.set([room("h1")]);
        flushSync();
        rooms.set([]);
        flushSync();
        rooms.set([room("h1")]);
        flushSync();
        expect(resume).toHaveBeenLastCalledWith([{ areaId: "area", propertyId: "prop", hostUuid: "h1" }], {
            micDeviceId: "mic",
        });
    });

    it("does not call the session while the room has no Jam", () => {
        render();
        flushSync();
        expect(resume).not.toHaveBeenCalled();
    });
});
