<script lang="ts">
    import { fade } from "svelte/transition";
    import LL from "../../../i18n/i18n-svelte";
    import { bubbleListenersStore } from "../../Stores/PeerStore";
    import { bubbleListenerNamesStore, heardMemberNamesStore } from "../../Stores/BubbleListeningStore";
    import { IconEar } from "@wa-icons";

    // Names are shown while they are few and all known; past that, the count keeps the hint short and discreet.
    let heardBy = $derived.by(() => {
        const names = $bubbleListenerNamesStore;
        const count = $bubbleListenersStore.length;
        if (count === 0) return undefined;
        if (names.length !== count || count > 2) return $LL.video.bubble_listening.heard_by_many({ count });
        if (count === 1) return $LL.video.bubble_listening.heard_by_one({ name: names[0] });
        return $LL.video.bubble_listening.heard_by_two({ first: names[0], second: names[1] });
    });

    let overhearing = $derived(
        $heardMemberNamesStore.length > 0
            ? $LL.video.bubble_listening.overhearing({ names: $heardMemberNamesStore.join(", ") })
            : undefined,
    );

    let hint = $derived(heardBy ?? overhearing);
</script>

{#if hint}
    <div
        class="fixed top-20 left-1/2 -translate-x-1/2 z-[900] pointer-events-none flex items-center gap-1.5 rounded-full bg-contrast/60 backdrop-blur px-3 py-1 text-xs text-white/80"
        role="status"
        transition:fade={{ duration: 400 }}
        data-testid="bubble-listening-hint"
    >
        <IconEar font-size="14" />
        <span>{hint}</span>
    </div>
{/if}
