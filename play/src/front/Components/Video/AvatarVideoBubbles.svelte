<script lang="ts">
    import * as Phaser from "phaser";
    import { get } from "svelte/store";
    import { avatarVideoEntriesStore } from "../../Stores/AvatarVideoStore";
    import { createAvatarVideoLayout } from "./AvatarVideoLayout";
    import AvatarVideoBubble from "./AvatarVideoBubble.svelte";

    const layout = createAvatarVideoLayout();

    $effect(() => {
        const entries = $avatarVideoEntriesStore;
        const scene = entries[0]?.character.scene;
        const updateLayout = (): void => {
            const visible = entries.filter(({ videoBox }) => {
                const streamable = get(videoBox.streamable);
                return (
                    streamable &&
                    get(streamable.hasVideo) &&
                    !get(streamable.media.isBlocked) &&
                    get(videoBox.statusStore) === "connected"
                );
            });
            layout.update(
                visible.map(({ videoBox, character }) => ({
                    id: videoBox.uniqueId,
                    x: character.x,
                    y: character.y,
                })),
            );
        };
        updateLayout();
        scene?.events.on(Phaser.Scenes.Events.POST_UPDATE, updateLayout);
        return () => scene?.events.off(Phaser.Scenes.Events.POST_UPDATE, updateLayout);
    });
</script>

{#each $avatarVideoEntriesStore as entry (entry.videoBox.uniqueId)}
    <AvatarVideoBubble
        videoBox={entry.videoBox}
        character={entry.character}
        placement={() => layout.get(entry.videoBox.uniqueId)}
    />
{/each}
