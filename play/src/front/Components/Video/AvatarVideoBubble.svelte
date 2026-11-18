<script lang="ts">
    import * as Phaser from "phaser";
    import type { Character } from "../../Phaser/Entity/Character";
    import type { VideoBox } from "../../Space/VideoBox";
    import MediaBox from "./MediaBox.svelte";

    interface Props {
        videoBox: VideoBox;
        character: Character;
        placement?: () => { x: number; y: number; size: number } | undefined;
    }

    let { videoBox, character, placement }: Props = $props();
    let element: HTMLDivElement | undefined = $state();
    let streamableStore = $derived(videoBox.streamable);
    let streamable = $derived($streamableStore);
    let hasVideoStore = $derived(streamable?.hasVideo);
    let isBlockedStore = $derived(streamable?.media.isBlocked);
    let statusStore = $derived(videoBox.statusStore);
    let visible = $derived($hasVideoStore === true && !$isBlockedStore && $statusStore === "connected");
    let voiceIndicatorStore = $derived(streamable?.showVoiceIndicator);
    let activeSpeaker = $derived($voiceIndicatorStore ?? false);

    $effect(() => {
        character.setVideoBubbleVisible(visible);
        return () => character.setVideoBubbleVisible(false);
    });

    $effect(() => {
        const node = element;
        const avatar = character;
        if (!node || !visible) return;
        let hovered = false;
        const enter = (): void => {
            if (!avatar.isClickable()) return;
            hovered = true;
            node.classList.add("hovered");
            avatar.emit(Phaser.Input.Events.POINTER_OVER);
        };
        const leave = (): void => {
            if (!hovered) return;
            hovered = false;
            node.classList.remove("hovered");
            avatar.emit(Phaser.Input.Events.POINTER_OUT);
        };
        node.addEventListener("mouseenter", enter);
        node.addEventListener("mouseleave", leave);
        return () => {
            leave();
            node.removeEventListener("mouseenter", enter);
            node.removeEventListener("mouseleave", leave);
        };
    });

    $effect(() => {
        const node = element;
        const avatar = character;
        const scene = avatar.scene;
        if (!node || !scene.usernameDomLayer) return;
        scene.usernameDomLayer.addUsername(node);

        const followAvatar = (): void => {
            const groupedPosition = placement?.();
            const position = groupedPosition ?? { x: avatar.x, y: avatar.y - 28, size: 48 };
            node.classList.toggle("grouped", groupedPosition !== undefined);
            node.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -100%)`;
            node.style.width = `${position.size}px`;
            node.style.height = `${position.size}px`;
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
    class:speaking={activeSpeaker}
    title={character.playerName}
    role="img"
    aria-label={character.playerName}
    data-testid="avatar-video-bubble"
    data-user-id={videoBox.uniqueId}
>
    {#if visible}
        <div class="avatar-video-name">
            <span class="presence-dot"></span>
            <span class="name-text">{character.playerName}</span>
        </div>
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

    .avatar-video-bubble:global(.grouped)::after {
        display: none;
    }

    .avatar-video-name {
        pointer-events: auto;
        position: absolute;
        left: 50%;
        bottom: calc(100% + 3px);
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 3px;
        max-width: calc(100% + 6px);
        box-sizing: border-box;
        padding: 2px 4px;
        border-radius: 4px;
        background: #202026b3;
        color: #fff;
        backdrop-filter: blur(4px);
        box-shadow: 0 1px 3px #0002;
        font:
            600 7px/9px Roboto,
            sans-serif;
        white-space: nowrap;
    }

    .name-text {
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
    }

    .presence-dot {
        width: 4px;
        height: 4px;
        flex-shrink: 0;
        border-radius: 50%;
        background: #80d88e;
    }

    .speaking .avatar-video-name {
        background: #5946aecd;
    }

    .avatar-video-bubble:global(.hovered) .avatar-video-name {
        box-shadow: 0 0 0 1px #fff9;
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
        transition:
            border-color 150ms,
            box-shadow 150ms;
    }

    .speaking .avatar-video-frame {
        border-color: #b1a5ff;
        box-shadow:
            0 0 0 0.5px #b1a5ff,
            0 0 6px #6856cc60,
            0 2px 4px #0003;
    }

    .avatar-video-frame :global(.media-container) {
        pointer-events: none;
    }
</style>
