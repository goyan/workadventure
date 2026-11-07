<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { coffeeCardsStore } from "../../Stores/CoffeeStore";

    function coffeeManager() {
        return gameManager.getCurrentGameScene().coffeeManager;
    }
</script>

<!-- One discreet card per colleague taking a coffee; it leaves with the end of their coffee. -->
{#each $coffeeCardsStore as card (card.senderUuid)}
    <div
        class="rounded bg-contrast/90 backdrop-blur-md text-white p-3 max-w-sm shadow-xl pointer-events-auto flex items-center gap-2"
        role="status"
        data-testid="coffeeCard"
    >
        <strong class="grow">{$LL.coffee.received({ name: card.senderName })}</strong>
        <button
            type="button"
            class="rounded bg-success px-3 py-1"
            data-testid="coffeeCardJoin"
            onclick={() => coffeeManager()?.join(card.senderUuid)}
        >
            {$LL.coffee.join()}
        </button>
        <button
            type="button"
            class="rounded hover:bg-white/20 px-2 leading-none"
            aria-label={$LL.actionbar.close()}
            data-testid="coffeeCardDismiss"
            onclick={() => coffeeManager()?.dismiss(card.senderUuid)}
        >
            ×
        </button>
    </div>
{/each}
