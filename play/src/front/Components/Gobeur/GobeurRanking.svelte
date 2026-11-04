<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { gobeurRankingStore } from "../../Stores/GobeurStore";
    import ButtonClose from "../Input/ButtonClose.svelte";
    import { chosenGobeurPlayers, gobeurPlayerName, presentGobeurPlayers } from "./GobeurPlayers";

    // Names from the property first (players who left too), then from the players around.
    function names(entityId: string) {
        const scene = gameManager.getCurrentGameScene();
        return [...chosenGobeurPlayers(scene, entityId), ...presentGobeurPlayers(scene.MapPlayersByKey.values())];
    }
</script>

{#if $gobeurRankingStore}
    {@const result = $gobeurRankingStore}
    {@const known = names(result.entityId)}
    <div
        class="absolute top-20 left-0 right-0 m-auto w-fit max-w-sm z-[150] rounded bg-contrast/90 backdrop-blur-md text-white p-4 shadow-xl pointer-events-auto"
        role="dialog"
        data-testid="gobeurRanking"
    >
        <div class="flex items-center justify-between gap-3">
            <strong>{$LL.mapEditor.properties.gobeur.ranking.title()}</strong>
            <ButtonClose onclick={() => gobeurRankingStore.set(undefined)} />
        </div>
        <p class="m-0 my-2 text-sm">{$LL.mapEditor.properties.gobeur.ranking.reasons[result.reason]()}</p>
        <ol class="m-0 p-0 list-none flex flex-col gap-1">
            {#each result.ranking as entry, index (entry.uuid)}
                <li class="flex flex-row gap-3 text-sm">
                    <span class="w-6 text-right">{index + 1}.</span>
                    <span class="grow">{gobeurPlayerName(entry.uuid, known)}</span>
                    <span class="opacity-70">{$LL.mapEditor.properties.gobeur.ranking[entry.status]()}</span>
                </li>
            {/each}
        </ol>
    </div>
{/if}
