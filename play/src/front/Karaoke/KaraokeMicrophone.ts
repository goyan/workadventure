/** The voice as it is sung: no noise suppression nor gain changes, which would flatten the notes. */
const KARAOKE_AUDIO = { echoCancellation: true, noiseSuppression: false, autoGainControl: false } as const;
const MISSING_DEVICE_ERRORS = new Set(["OverconstrainedError", "NotFoundError"]);

/**
 * Opens the microphone chosen in WorkAdventure, strictly: browsers treat a preferred device as a mere hint and open the
 * system's default input instead (a virtual cable such as BlackHole hears no voice). When that microphone is gone (a
 * headset unplugged), the default input is used rather than blocking the turn.
 */
export async function openKaraokeMicrophone(
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
    deviceId?: string,
): Promise<MediaStream> {
    if (deviceId) {
        try {
            return await getUserMedia({ audio: { ...KARAOKE_AUDIO, deviceId: { exact: deviceId } }, video: false });
        } catch (error) {
            const name = typeof error === "object" && error !== null && "name" in error ? error.name : undefined;
            if (typeof name !== "string" || !MISSING_DEVICE_ERRORS.has(name)) throw error;
        }
    }
    return getUserMedia({ audio: { ...KARAOKE_AUDIO }, video: false });
}
