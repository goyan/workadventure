<script lang="ts">
    import { avatarVideoEntriesStore } from "../../Stores/AvatarVideoStore";
    import AvatarVideoBubble from "./AvatarVideoBubble.svelte";
</script>

{#each $avatarVideoEntriesStore as entry (entry.videoBox.uniqueId)}
    <AvatarVideoBubble videoBox={entry.videoBox} character={entry.character} />
{/each}
