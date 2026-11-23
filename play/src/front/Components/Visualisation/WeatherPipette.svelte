<script lang="ts">
    import type { CellExplained } from "@wa/front/Phaser/Game/Weather/CellExplained";
    import type { AirOwner, Audience } from "@wa/front/Phaser/Game/Weather/WeatherExplained";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { weatherPipetteStore } from "../../Stores/VisualisationStore";
    import { pipetteSections } from "./pipetteText";
    import { IconMap, IconUser, IconUsers, IconX } from "@wa-icons";

    /**
     * The weather pipette: what goes on in the cell of the ground under the pointer, in sentences (pipetteText). It
     * only shows what the game read there (CellProbeNow); it takes no click and sends nothing.
     */
    interface Props {
        /** The cell under the pointer; undefined while the pointer is off the map. */
        cell: CellExplained | undefined;
    }
    let { cell }: Props = $props();

    const t = $derived($LL.actionbar.visualisation.weather);
    const sections = $derived(cell ? pipetteSections($LL, $locale, cell) : []);

    // The same colours as the weather board: the air of the map in blue, the player's own in yellow.
    const OWNER_PILL: Record<AirOwner, string> = {
        map: "bg-blue-500/50 ring-1 ring-blue-500",
        own: "bg-yellow-400/80 text-black",
    };
    const OWNER_EDGE: Record<AirOwner, string> = { map: "border-blue-500", own: "border-yellow-400" };

    function ownerName(owner: AirOwner): string {
        return owner === "map" ? t.decidedBy.map() : t.decidedBy.own();
    }
    function audienceName(audience: Audience): string {
        if (audience === "everyone") return t.seenBy.everyone();
        return audience === "you" ? t.seenBy.you() : t.seenBy.serverFollowers();
    }
</script>

<section
    class="relative flex max-h-[70vh] w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-xl bg-contrast/80 p-2 text-xs backdrop-blur"
    aria-label={t.pipette.title()}
    aria-live="polite"
    data-testid="weather-pipette"
>
    <header class="pe-6">
        <h2 class="m-0 text-sm font-bold">{t.pipette.title()}</h2>
        <p class="m-0 opacity-80">{t.pipette.hint()}</p>
    </header>
    <button
        type="button"
        class="absolute end-1 top-1 rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
        aria-label={t.pipette.close()}
        data-testid="weather-pipette-close"
        onclick={() => weatherPipetteStore.set(false)}
    >
        <IconX font-size="14" />
    </button>
    {#if !cell}
        <p class="m-0 opacity-80" data-testid="weather-pipette-away">{t.pipette.away()}</p>
    {:else}
        {@const owner = cell.ground}
        <div class="flex flex-col gap-1" data-testid="weather-pipette-ground">
            <p class="m-0 font-bold">
                {owner === "own" && cell.city !== undefined
                    ? t.pipette.ownGround({ city: cell.city })
                    : t.pipette.serverGround()}
            </p>
            <!-- Whose air decides and who sees the same, once for the cell: the sections it holds for bear its colour. -->
            <div class="flex flex-wrap gap-1">
                <span class="inline-flex items-center gap-1 rounded-full px-1.5 {OWNER_PILL[owner]}" data-air={owner}>
                    {#if owner === "map"}<IconMap width="11" height="11" />{:else}<IconUser
                            width="11"
                            height="11"
                        />{/if}
                    <span>{t.decidedBy.label()} <b>{ownerName(owner)}</b></span>
                </span>
                <span
                    class="inline-flex items-center gap-1 rounded-full px-1.5 ring-1 ring-white/50"
                    data-audience={cell.audience}
                >
                    {#if cell.audience === "you"}<IconUser width="11" height="11" />{:else}<IconUsers
                            width="11"
                            height="11"
                        />{/if}
                    <span>{t.seenBy.label()} <b>{audienceName(cell.audience)}</b></span>
                </span>
            </div>
        </div>
        {#each sections as section (section.id)}
            <article
                class="flex flex-col gap-0.5 rounded-lg border-0 border-s-4 border-solid bg-white/10 p-1.5 {section.owner
                    ? OWNER_EDGE[section.owner]
                    : 'border-white/30'}"
                data-testid="weather-pipette-{section.id}"
                data-air={section.owner}
            >
                <h3 class="m-0 text-xs font-bold uppercase tracking-wide opacity-80">{section.title}</h3>
                {#each section.lines as line, index (index)}
                    <p class="m-0 {index === 0 ? 'font-bold' : 'opacity-90'}">{line}</p>
                {/each}
            </article>
        {/each}
    {/if}
</section>
