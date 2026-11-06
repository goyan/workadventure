<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { waveCardsStore } from "../../Stores/WaveStore";

    function waveManager() {
        return gameManager.getCurrentGameScene().waveManager;
    }
</script>

<!-- One card per colleague who waved at the local player, most recent first; it stays until an action. -->
{#each $waveCardsStore as card (card.senderUuid)}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto flex flex-col gap-2"
        role="alert"
        data-testid="waveCard"
    >
        <div class="flex items-start gap-2">
            <strong class="grow">{$LL.wave.received({ name: card.senderName })}</strong>
            <button
                type="button"
                class="rounded hover:bg-white/20 px-2 leading-none"
                aria-label={$LL.actionbar.close()}
                data-testid="waveCardDismiss"
                onclick={() => waveManager()?.dismiss(card.senderUuid)}
            >
                ×
            </button>
        </div>
        <!-- An unknown sender (no uuid) can be neither joined nor answered. -->
        {#if card.senderUuid !== ""}
            <div class="flex gap-2">
                <button
                    type="button"
                    class="rounded bg-success px-3 py-1"
                    data-testid="waveCardGoTo"
                    onclick={() => waveManager()?.goTo(card.senderUuid)}
                >
                    {$LL.wave.goTo()}
                </button>
                <button
                    type="button"
                    class="rounded bg-white/10 hover:bg-white/20 px-3 py-1"
                    data-testid="waveCardReply"
                    onclick={() => waveManager()?.reply(card.senderUuid)}
                >
                    {$LL.wave.reply()}
                </button>
            </div>
        {/if}
    </div>
{/each}
