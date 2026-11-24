<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import JamRoomsList from "./JamRoomsList.svelte";
</script>

<!-- Every Jam room of the map, shown in the Jam drawer outside the listening zones. -->
<div
    class="w-full max-h-[60vh] overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-3 pointer-events-auto"
    data-testid="jam-rooms-panel"
>
    <p class="m-0 pe-6 text-sm font-bold text-white/95">{$LL.spotify.listeningZone.roomsTitle()}</p>
    <JamRoomsList />
    <p class="m-0 text-xs text-white/50">{$LL.spotify.listeningZone.createHint()}</p>
</div>
