<script lang="ts">
    import type { VideoBox } from "../../../Space/VideoBox";
    import Woka from "../../Woka/Woka.svelte";
    import LivekitVideo from "../VideoTags/LivekitVideo.svelte";
    import { requestedCameraState, requestedMicrophoneState } from "../../../Stores/MediaStore";
    import { IconMicrophone, IconMicrophoneOff, IconVideo, IconVideoOff } from "@wa-icons";

    interface Props {
        videoBox: VideoBox;
    }

    let { videoBox }: Props = $props();
    let user = $derived(videoBox.spaceUser);
    let local = $derived(videoBox.uniqueId === "-1");
    let microphoneStore = $derived(local ? requestedMicrophoneState : user.reactiveUser.microphoneState);
    let cameraStore = $derived(local ? requestedCameraState : user.reactiveUser.cameraState);
    let pictureStore = $derived(user.pictureStore);
    let streamableStore = $derived(videoBox.streamable);
    let voiceStore = $derived($streamableStore?.showVoiceIndicator);
    let blockedStore = $derived($streamableStore?.media.isBlocked);
    let hasVideoStore = $derived($streamableStore?.hasVideo);
    let statusStore = $derived(videoBox.statusStore);
    let speaking = $derived($microphoneStore && !$blockedStore && $voiceStore === true);
    let showVideo = $derived($cameraStore && $hasVideoStore && !$blockedStore && $statusStore === "connected");
    let webRtcStreamStore = $derived(
        $streamableStore?.media.type === "webrtc" ? $streamableStore.media.streamStore : undefined,
    );
    let videoElement: HTMLVideoElement | undefined = $state();

    // A muted preview must not change the transport's dimensions or play the participant's audio twice.
    $effect(() => {
        const element = videoElement;
        if (!element) return;
        element.srcObject = $webRtcStreamStore ?? null;
        return () => {
            element.srcObject = null;
        };
    });
</script>

<!-- One participant of the call whose avatar is out of the view: name, talking, microphone and camera. -->
<li class="call-chip" class:speaking data-testid="call-strip-chip" aria-label={user.name}>
    <span class="call-chip-avatar">
        {#if $pictureStore}<Woka src={$pictureStore} customWidth="28px" />{/if}
    </span>
    <span class="call-chip-name">{user.name}</span>
    <span class="call-chip-state" class:off={!$microphoneStore} data-testid="call-strip-microphone">
        {#if $microphoneStore}<IconMicrophone font-size="14" />{:else}<IconMicrophoneOff font-size="14" />{/if}
    </span>
    <span class="call-chip-state" class:off={!$cameraStore} data-testid="call-strip-camera">
        {#if showVideo && $streamableStore?.media.type === "livekit"}
            <span class="call-chip-video">
                <LivekitVideo
                    media={$streamableStore.media}
                    style="width:100%;height:100%;object-fit:cover"
                    className=""
                    videoWidth={0}
                    videoHeight={0}
                />
            </span>
        {:else if showVideo && $streamableStore?.media.type === "webrtc"}
            <video
                bind:this={videoElement}
                class="call-chip-video"
                style:transform={local ? "scaleX(-1)" : undefined}
                autoplay
                playsinline
                muted
            ></video>
        {:else if $cameraStore}<IconVideo font-size="14" />{:else}<IconVideoOff font-size="14" />{/if}
    </span>
</li>
