<script lang="ts">
    import { videoStreamElementsStore } from "../../../Stores/PeerStore";
    import { myCameraPeerStore } from "../../../Stores/StreamableCollectionStore";
    import { highlightedEmbedScreen } from "../../../Stores/HighlightedEmbedScreenStore";
    import { highlightFullScreen } from "../../../Stores/ActionsCamStore";
    import { avatarVideosEnabledStore } from "../../../Stores/AvatarVideoStore";
    import { offscreenCallUsersStore } from "../../../Stores/CallStripStore";
    import CallStripChip from "./CallStripChip.svelte";

    /** Beyond this many, the others are counted ("+N"): a call of ten stays one line. */
    const MAX_CHIPS = 6;
    let expanded = $state(false);

    // With the videos over the avatars, everyone of the call in a mini tile while one looks at the call (the videos
    // are over the avatars). Looking away, or without the videos over the avatars: large tiles, no strip.
    let lookingAway = $derived($offscreenCallUsersStore.has("local"));
    let offscreen = $derived(
        $avatarVideosEnabledStore && !lookingAway && $videoStreamElementsStore.length > 0
            ? [...$videoStreamElementsStore, $myCameraPeerStore]
            : [],
    );
    let shown = $derived(offscreen.slice(0, MAX_CHIPS));
    let more = $derived(offscreen.length - shown.length);
</script>

{#if offscreen.length > 0 && !$highlightedEmbedScreen && !$highlightFullScreen}
    <ul class="call-strip" data-testid="call-strip">
        {#each shown as videoBox (videoBox.uniqueId)}
            <CallStripChip {videoBox} />
        {/each}
        {#if more > 0}
            <li class="call-strip-overflow">
                <details bind:open={expanded}>
                    <summary class="call-chip more" data-testid="call-strip-more">+{more}</summary>
                    {#if expanded}<ul class="call-strip-list">
                            {#each offscreen.slice(MAX_CHIPS) as videoBox (videoBox.uniqueId)}
                                <CallStripChip {videoBox} />
                            {/each}
                        </ul>{/if}
                </details>
            </li>
        {/if}
    </ul>
{/if}
