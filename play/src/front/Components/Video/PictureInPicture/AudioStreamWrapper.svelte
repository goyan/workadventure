<script lang="ts">
    import { derived, writable } from "svelte/store";
    import { selectDefaultSpeaker, speakerSelectedStore } from "../../../Stores/MediaStore";
    import type { VideoBox } from "../../../Space/VideoBox";
    import AudioStream from "./AudioStream.svelte";

    interface Props {
        videoBox: VideoBox;
        /** Scales the stream's volume: a bubble heard from its edge plays low (LISTENED_BUBBLE_VOLUME). */
        volumeFactor?: number;
    }

    let { videoBox, volumeFactor = 1 }: Props = $props();
    let streamable = $derived(videoBox.streamable);
    let volume = $derived(
        $streamable && volumeFactor !== 1
            ? derived($streamable.volume, ($volume) => $volume * volumeFactor)
            : $streamable?.volume,
    );

    let muteAudioStore = $derived($streamable?.muteAudio);
    let muteAudio = $derived($muteAudioStore ?? false);

    let hasAudio = $derived($streamable?.hasAudio ?? writable(false));
</script>

{#if volume && $streamable && ($streamable?.media.type === "webrtc" || $streamable?.media.type === "livekit") && !muteAudio && $hasAudio}
    <AudioStream
        streamStore={$streamable.media.streamStore}
        {volume}
        outputDeviceId={$speakerSelectedStore}
        isBlocked={$streamable.media.isBlocked}
        onselectoutputaudiodeviceerror={() => selectDefaultSpeaker()}
    />
{/if}
