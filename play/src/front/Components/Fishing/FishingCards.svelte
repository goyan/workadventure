<script lang="ts">
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { formatKilograms } from "../../Phaser/Game/Fishing/FishingProtocol";
    import { fishingCardsStore } from "../../Stores/FishingStore";
    import type { FishingCard } from "../../Stores/FishingStore";
    import { IconFish, IconRipple } from "@wa-icons";

    /** What a card says: a catch with its fish and its weight, or why the line came back empty. */
    function textOf(card: FishingCard, language: string): string {
        const texts = $LL.actionbar.rod;
        if (card.kind !== "caught") return texts[card.kind]();
        const fish = card.female ? texts.pinkFish() : texts.blueFish();
        const weight = formatKilograms(card.grams ?? 0, language);
        return card.own || card.name === undefined
            ? texts.caught({ fish, weight })
            : texts.caughtBy({ name: card.name, fish, weight });
    }
</script>

<!-- What just happened at the end of a fishing line: under the action bar, never in the way of a click. -->
<div
    class="pointer-events-none absolute left-1/2 top-40 z-[300] flex -translate-x-1/2 flex-col items-center gap-1 select-none"
    aria-live="polite"
    data-testid="fishing-cards"
>
    {#each $fishingCardsStore as card (card.id)}
        <div
            class="fishing-card"
            class:own={card.kind === "caught" && card.own}
            class:missed={card.kind !== "caught"}
            data-testid="fishing-card-{card.kind}"
        >
            <span
                class="fishing-badge"
                aria-hidden="true"
                style:color={card.kind === "caught" ? (card.female ? "#e98bb5" : "#6fa8ee") : undefined}
            >
                {#if card.kind === "caught"}
                    <IconFish font-size="16" />
                {:else}
                    <IconRipple font-size="16" />
                {/if}
            </span>
            {textOf(card, $locale)}
        </div>
    {/each}
</div>
