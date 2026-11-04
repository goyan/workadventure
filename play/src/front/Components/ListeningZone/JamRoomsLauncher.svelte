<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { allJamRoomsStore } from "../../ListeningZone/ListeningZoneController";
    import { currentListeningZoneStore, jamRoomsPanelOpenStore } from "../../ListeningZone/ListeningZoneStore";
    import JamRoomsList from "./JamRoomsList.svelte";
    import { IconHeadphones } from "@wa-icons";

    // In a listening zone, its bubble already lists the rooms; elsewhere, the button opens the same list.
    let shown = $derived(!$currentListeningZoneStore && $allJamRoomsStore.length > 0);
</script>

{#if shown}
    <div class="flex flex-col items-end gap-2 pointer-events-auto">
        <button
            type="button"
            class="flex items-center gap-1.5 rounded-full bg-contrast/80 px-3 py-1.5 text-xs font-bold text-[#1ed760] backdrop-blur hover:bg-contrast"
            onclick={() => jamRoomsPanelOpenStore.update((open) => !open)}
            data-testid="jam-rooms-launcher"
        >
            <IconHeadphones font-size="14" />
            {$LL.spotify.listeningZone.jamsButton({ count: $allJamRoomsStore.length })}
        </button>
        {#if $jamRoomsPanelOpenStore}
            <div
                class="w-80 max-w-[90vw] max-h-[60vh] overflow-y-auto rounded-lg bg-contrast/80 p-4 backdrop-blur flex flex-col gap-3"
                data-testid="jam-rooms-panel"
            >
                <p class="m-0 text-sm font-bold text-white/95">{$LL.spotify.listeningZone.roomsTitle()}</p>
                <JamRoomsList />
                <p class="m-0 text-xs text-white/50">{$LL.spotify.listeningZone.createHint()}</p>
            </div>
        {/if}
    </div>
{/if}
