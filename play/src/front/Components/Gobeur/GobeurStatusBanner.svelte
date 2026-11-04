<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { localUserStore } from "../../Connection/LocalUserStore";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { gobeurAnnounceStore, gobeurGamesStore } from "../../Stores/GobeurStore";
    import { formatGobeurRemaining } from "./GobeurPlayers";

    const ANNOUNCE_DURATION_MS = 5000;

    const localUuid = localUserStore.getLocalUser()?.uuid ?? "";

    let now = $state(Date.now());
    const clock = setInterval(() => {
        now = Date.now();
    }, 1000);
    onDestroy(() => clearInterval(clock));

    // The announcement shows for a few seconds after the start it was set for.
    let announcing = $derived(
        $gobeurAnnounceStore !== undefined && now - $gobeurAnnounceStore.at < ANNOUNCE_DURATION_MS,
    );

    // The running games this browser takes part in, as a player or as the master.
    let games = $derived(
        [...$gobeurGamesStore.entries()].filter(
            ([, game]) =>
                game.running &&
                (game.isMaster || game.survivors.includes(localUuid) || game.caught.includes(localUuid)),
        ),
    );

    function stop(entityId: string) {
        gameManager.getCurrentGameScene().gobeurManager?.stop(entityId);
    }
</script>

{#if announcing || games.length > 0}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto flex flex-col gap-2"
        role="status"
        data-testid="gobeurStatusBanner"
    >
        {#if announcing}
            <strong>{$LL.mapEditor.properties.gobeur.announce()}</strong>
        {/if}
        {#each games as [entityId, game] (entityId)}
            <div class="flex flex-col gap-1 text-sm">
                <span>
                    {$LL.mapEditor.properties.gobeur.remaining({ time: formatGobeurRemaining(game.endsAt - now) })}
                </span>
                <span>
                    {$LL.mapEditor.properties.gobeur.survivors({ count: game.survivors.length })} ·
                    {$LL.mapEditor.properties.gobeur.caught({ count: game.caught.length })}
                </span>
                {#if game.isMaster}
                    <button
                        type="button"
                        class="rounded bg-danger px-3 py-1"
                        data-testid="gobeurBannerStop"
                        onclick={() => stop(entityId)}
                    >
                        {$LL.mapEditor.properties.gobeur.stop()}
                    </button>
                {/if}
            </div>
        {/each}
    </div>
{/if}
