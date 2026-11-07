<script lang="ts">
    import type { Readable } from "svelte/store";
    import JamMusicPlayer from "./JamMusicPlayer.svelte";

    interface Props {
        /** The space of the Jam the user listens to, once joined. */
        listeningSpaceName: Readable<string | undefined>;
    }

    let { listeningSpaceName }: Props = $props();
</script>

<!--
    The music plays here, mounted for as long as the user listens, and not in the card of the Jam: the card exists only
    while the panel is open (or the Jam is listed in a zone's bubble), and the music must not stop when it is minimised.
-->
{#if $listeningSpaceName}
    {#key $listeningSpaceName}
        <JamMusicPlayer spaceName={$listeningSpaceName} />
    {/key}
{/if}
