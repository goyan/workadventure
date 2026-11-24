<script lang="ts">
    import { derived } from "svelte/store";
    import { jamMusicMutedStore, jamMusicStreamsStore, jamMusicVolumeStore } from "../../ListeningZone/JamMusicStore";
    import { speakerSelectedStore } from "../../Stores/AudioOutputStore";
    import { soundEffectsSilencedStore } from "../../Stores/SoundEffectsStore";
    import AudioStream from "../Video/PictureInPicture/AudioStream.svelte";

    interface Props {
        /** The space of the Jam whose music is played: the music of another Jam is never heard. */
        spaceName: string;
    }

    let { spaceName }: Props = $props();

    let streamStore = $derived(derived(jamMusicStreamsStore, ($streams) => $streams.get(spaceName)));

    // Muted by the listener, or cut by a silent zone (a Teams meeting room): the music comes back on leaving it.
    const blocked = derived(
        [jamMusicMutedStore, soundEffectsSilencedStore],
        ([$muted, $silenced]) => $muted || $silenced,
    );
</script>

<!-- The music alone: its volume and its silence are not the voices'. The player reuses the output device the user picked. -->
<AudioStream
    conversation={false}
    {streamStore}
    outputDeviceId={$speakerSelectedStore}
    isBlocked={blocked}
    volume={jamMusicVolumeStore}
/>
