import { FilterType } from "@workadventure/messages";
import type { SpaceInterface } from "../Space/SpaceInterface";
import type { SpaceRegistryInterface } from "../Space/SpaceRegistry/SpaceRegistryInterface";
import { getJamMusicPublisher, onJamMusicPublisherRegistered } from "../ListeningZone/JamMusicStore";
import { openKaraokeMicrophone } from "./KaraokeMicrophone";

export interface KaraokeVoiceSession {
    join(spaceName: string): Promise<void>;
    sing(deviceId?: string): Promise<MediaStream | undefined>;
    stop(): Promise<void>;
    leave(): Promise<void>;
}

/** The mic is requested by a singer's click, never by the host selecting somebody else. */
export function createKaraokeVoiceSession(
    registry: Pick<SpaceRegistryInterface, "joinSpace" | "leaveSpace">,
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): KaraokeVoiceSession {
    let generation = 0;
    let spaceName: string | undefined;
    let joined: Promise<SpaceInterface> | undefined;
    let abort: AbortController | undefined;
    let stream: MediaStream | undefined;
    let unwatch: (() => void) | undefined;
    async function stop(): Promise<void> {
        generation++;
        unwatch?.();
        unwatch = undefined;
        const current = stream;
        stream = undefined;
        current?.getTracks().forEach((track) => track.stop());
        if (spaceName) await getJamMusicPublisher(spaceName)?.publishJamMusic(undefined);
    }
    async function leave(): Promise<void> {
        const previous = joined;
        joined = undefined;
        abort?.abort();
        abort = undefined;
        try {
            await stop();
        } finally {
            spaceName = undefined;
            const space = await previous?.catch(() => undefined);
            if (space) await registry.leaveSpace(space);
        }
    }
    return {
        stop,
        leave,
        async join(name) {
            if (joined) throw new Error("The karaoke session already has a stage");
            spaceName = name;
            abort = new AbortController();
            joined = registry.joinSpace(name, FilterType.ALL_USERS, [], abort.signal);
            await joined;
        },
        async sing(deviceId) {
            if (!spaceName || !joined) throw new Error("The karaoke stage is not joined");
            await stop();
            const mine = generation;
            const name = spaceName;
            const captured = await openKaraokeMicrophone(getUserMedia, deviceId);
            if (mine !== generation || name !== spaceName) {
                captured.getTracks().forEach((track) => track.stop());
                return;
            }
            stream = captured;
            const publisher = getJamMusicPublisher(name);
            if (!publisher) {
                await stop();
                throw new Error("The karaoke audio connection is not ready");
            }
            try {
                await publisher.publishJamMusic(captured);
            } catch (error) {
                await stop();
                throw error;
            }
            if (mine !== generation) {
                await publisher.publishJamMusic(undefined);
                return;
            }
            unwatch = onJamMusicPublisherRegistered(name, (next) => {
                next.publishJamMusic(captured).catch(() => {
                    stop().catch(() => undefined);
                });
            });
            return captured;
        },
    };
}
