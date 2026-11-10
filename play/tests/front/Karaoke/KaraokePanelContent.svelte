<script lang="ts">
    import type { Writable } from "svelte/store";
    import type { KaraokePlayback } from "../../../src/front/Karaoke/JamKaraoke";
    import type { JamRoom } from "../../../src/front/ListeningZone/ListeningZoneController";
    import type { LyricsLoader } from "../../../src/front/Karaoke/LyricsLoader";
    import KaraokePanel from "../../../src/front/Components/ListeningZone/KaraokePanel.svelte";

    let {
        playback,
        room,
        loader,
        onclose,
    }: {
        playback: Writable<KaraokePlayback>;
        room: JamRoom;
        loader: LyricsLoader;
        onclose: () => void;
    } = $props();
</script>

<KaraokePanel playback={$playback} {room} {loader} {onclose} />
