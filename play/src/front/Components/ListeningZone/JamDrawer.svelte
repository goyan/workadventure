<script lang="ts">
    import { fly } from "svelte/transition";
    import { LL } from "../../../i18n/i18n-svelte";
    import { allJamRoomsStore } from "../../ListeningZone/ListeningZoneController";
    import { currentListeningZoneStore } from "../../ListeningZone/ListeningZoneStore";
    import { jamDrawer, type JamDrawer } from "../../ListeningZone/JamDrawerStore";
    import ListeningZoneBubble from "./ListeningZoneBubble.svelte";
    import JamRoomsOverview from "./JamRoomsOverview.svelte";
    import { IconChevronRight, IconHeadphones } from "@wa-icons";

    interface Props {
        /** Injected by the tests. */
        drawer?: Pick<JamDrawer, "open" | "toggle">;
        /** A Jam is playing for the user: the icon says so while the drawer is closed. */
        listening?: boolean;
    }

    let { drawer = jamDrawer, listening = false }: Props = $props();
    const open = $derived(drawer.open);

    // In a listening zone, the drawer holds the zone's panel, where a room is opened; elsewhere, every Jam of the map.
    let shown = $derived($currentListeningZoneStore !== undefined || $allJamRoomsStore.length > 0);
    let label = $derived($open ? $LL.spotify.listeningZone.hideDrawer() : $LL.spotify.listeningZone.showDrawer());
</script>

{#if shown}
    <div class="flex items-start gap-1 pointer-events-auto" data-testid="jam-drawer">
        {#if $open}
            <div class="relative" transition:fly={{ x: 320, duration: 200 }} data-testid="jam-drawer-panel">
                {#if $currentListeningZoneStore}
                    <ListeningZoneBubble />
                {:else}
                    <JamRoomsOverview />
                {/if}
                <button
                    type="button"
                    class="absolute top-3 right-3 rounded p-0.5 text-white/60 hover:bg-white/10 hover:text-white"
                    aria-label={label}
                    title={label}
                    onclick={() => drawer.toggle()}
                    data-testid="jam-drawer-close"><IconChevronRight font-size="16" /></button
                >
            </div>
        {/if}
        <button
            type="button"
            class="relative flex flex-col items-center gap-0.5 rounded-lg bg-contrast/80 px-2 py-2 text-[#1ed760] backdrop-blur hover:bg-contrast"
            class:ring-2={listening}
            class:ring-[#1ed760]={listening}
            aria-expanded={$open}
            aria-label={`${label} (${$LL.spotify.listeningZone.jamsButton({ count: $allJamRoomsStore.length })})`}
            title={label}
            onclick={() => drawer.toggle()}
            data-listening={listening}
            data-testid="jam-drawer-tab"
        >
            <IconHeadphones font-size="20" />
            {#if $allJamRoomsStore.length > 0}
                <span class="text-xs font-bold leading-none">{$allJamRoomsStore.length}</span>
            {/if}
        </button>
    </div>
{/if}
