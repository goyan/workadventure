<script lang="ts">
    import type { ListeningSource } from "../../../common/SpotifyListening";
    import { IconBrandApple, IconBrandSpotify } from "@wa-icons";

    interface Props {
        source: ListeningSource;
        size?: string;
    }

    let { source, size = "16" }: Props = $props();
</script>

{#if source === "apple-music"}
    <IconBrandApple font-size={size} class="shrink-0 text-[#fa2d48]" aria-label="Apple Music" />
{:else}
    <IconBrandSpotify font-size={size} class="shrink-0 text-[#1ed760]" aria-label="Spotify" />
{/if}
