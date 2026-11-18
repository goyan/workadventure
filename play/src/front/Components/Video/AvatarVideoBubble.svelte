<script lang="ts">
    import * as Phaser from "phaser";
    import type { Character } from "../../Phaser/Entity/Character";
    import type { VideoBox } from "../../Space/VideoBox";
    import MediaBox from "./MediaBox.svelte";

    interface Props {
        videoBox: VideoBox;
        character: Character;
    }

    let { videoBox, character }: Props = $props();
    let element: HTMLDivElement | undefined = $state();
    let streamableStore = $derived(videoBox.streamable);
    let streamable = $derived($streamableStore);
    let hasVideoStore = $derived(streamable?.hasVideo);
    let isBlockedStore = $derived(streamable?.media.isBlocked);
    let statusStore = $derived(videoBox.statusStore);
    let visible = $derived($hasVideoStore === true && !$isBlockedStore && $statusStore === "connected");

    $effect(() => {
        character.setVideoBubbleVisible(visible);
        return () => character.setVideoBubbleVisible(false);
    });

    $effect(() => {
        const node = element;
        const avatar = character;
        const scene = avatar.scene;
        if (!node || !scene.usernameDomLayer) return;
        scene.usernameDomLayer.addUsername(node);

        const followAvatar = (): void => {
            node.style.transform = `translate3d(${avatar.x}px, ${avatar.y - 28}px, 0) translate(-50%, -100%)`;
            node.style.zIndex = `${Math.round(avatar.depth)}`;
        };
        followAvatar();
        scene.events.on(Phaser.Scenes.Events.RENDER, followAvatar);
        return () => {
            scene.events.off(Phaser.Scenes.Events.RENDER, followAvatar);
            node.remove();
        };
    });
</script>

<div
    bind:this={element}
    class="avatar-video-bubble"
    class:visible
    title={character.playerName}
    role="img"
    aria-label={character.playerName}
    data-testid="avatar-video-bubble"
    data-user-id={videoBox.uniqueId}
>
    {#if visible}
        <div class="avatar-video-frame">
            <MediaBox {videoBox} activeUserName={false} avatarBubble />
        </div>
    {/if}
</div>

<style>
    .avatar-video-bubble {
        position: absolute;
        top: 0;
        left: 0;
        width: 48px;
        height: 48px;
        display: none;
        pointer-events: none;
        will-change: transform;
    }

    .avatar-video-bubble.visible {
        display: block;
    }

    .avatar-video-bubble::after {
        content: "";
        position: absolute;
        left: 50%;
        top: calc(100% + 5px);
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #202026;
        transform: translateX(-50%);
    }

    .avatar-video-frame {
        width: 100%;
        height: 100%;
        overflow: hidden;
        box-sizing: border-box;
        border: 1.5px solid #202026;
        border-radius: 7px;
        background: #202026;
        box-shadow: 0 2px 4px #0003;
        pointer-events: auto;
    }

    .avatar-video-frame :global(.media-container) {
        pointer-events: none;
    }
</style>
