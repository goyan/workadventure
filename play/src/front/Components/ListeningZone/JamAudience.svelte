<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        isLocalUser,
        jamParticipantsStore,
        localPlayerName,
        type JamRoom,
    } from "../../ListeningZone/ListeningZoneController";
    import { playersStore } from "../../Stores/PlayersStore";
    import { listeningUserNamesStore } from "../../Spotify/SpotifyListeningDirectory";
    import { IconHeadphones } from "@wa-icons";

    let { room }: { room: JamRoom } = $props();
    let members = $derived($jamParticipantsStore.get(room.jam.hostUuid) ?? [room.jam.hostUuid]);
    let playersByUuid = $derived(new Map([...$playersStore.values()].map((player) => [player.userUuid, player])));
</script>

<details class="rounded-xl border border-white/10 bg-black/10 text-xs" data-testid="jam-audience">
    <summary
        class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-white/80 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
        <IconHeadphones font-size="14" class="text-[var(--jam-accent,#1ed760)]" />
        <span>{$LL.spotify.listeningZone.audience({ count: members.length })}</span>
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
        <ul class="m-0 flex max-h-40 list-none flex-col gap-1 overflow-y-auto p-0">
            {#each members as uuid (uuid)}
                {@const host = uuid === room.jam.hostUuid}
                {@const name = isLocalUser(uuid)
                    ? localPlayerName() || $LL.spotify.listeningZone.audienceYou()
                    : $listeningUserNamesStore.get(uuid) ||
                      playersByUuid.get(uuid)?.name ||
                      (host ? room.jam.hostName : "") ||
                      $LL.spotify.listeningZone.audienceUnknown()}
                <li class="flex min-w-0 items-center gap-2 py-1" data-testid="jam-audience-member">
                    <span
                        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--jam-accent,#1ed760)]/15 font-bold text-[var(--jam-accent,#1ed760)]"
                        aria-hidden="true">{name.slice(0, 1).toLocaleUpperCase()}</span
                    >
                    <span class="truncate text-white/90">{name}</span>
                    {#if host}<span class="ml-auto shrink-0 text-[10px] text-white/50"
                            >{$LL.spotify.listeningZone.audienceHost()}</span
                        >{/if}
                </li>
            {/each}
        </ul>
    </div>
</details>
