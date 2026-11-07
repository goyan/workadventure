<script lang="ts">
    import { isHomeJam } from "@workadventure/map-editor";
    import type { Readable } from "svelte/store";
    import type { JamAudioSession } from "../../ListeningZone/JamAudioSession";
    import type { JamRoom } from "../../ListeningZone/ListeningZoneController";

    interface Props {
        session: JamAudioSession;
        /** The Jams of the room: after a restart or a reload they come back one by one. */
        rooms: Readable<JamRoom[]>;
        /** The input the user speaks into, which the music is never shared from. */
        micDeviceId: Readable<string | undefined>;
    }

    let { session, rooms, micDeviceId }: Props = $props();

    // What the user listened to or shared is picked up again as soon as its Jam is back: the session knows what to
    // resume and what to leave alone, this only tells it which Jams are there.
    $effect(() => {
        const jams = $rooms
            .filter((room) => !isHomeJam(room.jam))
            .map((room) => ({
                areaId: room.zone.areaId,
                propertyId: room.zone.propertyId,
                hostUuid: room.jam.hostUuid,
            }));
        if (jams.length === 0) {
            return;
        }
        session.resume(jams, { micDeviceId: $micDeviceId }).catch((error) => console.error("Jam audio resume", error));
    });
</script>
