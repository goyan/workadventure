<script lang="ts">
    import { derived } from "svelte/store";
    import { jamMusicMutedStore, jamMusicStreamsStore, jamMusicVolumeStore } from "../../ListeningZone/JamMusicStore";
    import { speakerSelectedStore } from "../../Stores/AudioOutputStore";
    import AudioStream from "../Video/PictureInPicture/AudioStream.svelte";

    interface Props {
        /** The space of the Jam whose music is played: the music of another Jam is never heard. */
        spaceName: string;
    }

    let { spaceName }: Props = $props();

    let streamStore = $derived(derived(jamMusicStreamsStore, ($streams) => $streams.get(spaceName)));
</script>

<!-- The music alone: its volume and its silence are not the voices'. The player reuses the output device the user picked. -->
<AudioStream
    {streamStore}
    outputDeviceId={$speakerSelectedStore}
    isBlocked={jamMusicMutedStore}
    volume={jamMusicVolumeStore}
/>
