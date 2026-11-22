<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { fastWaterRightsStore, fastWaterStore, requestFastWater } from "../../Stores/FastWaterStore";
    import ChipPopover from "./ChipPopover.svelte";
    import { IconPlayerTrackNext } from "@wa-icons";

    interface Props {
        /** Only the icon of the chip is drawn: the clock line is short of room. */
        compact?: boolean;
    }
    let { compact = false }: Props = $props();

    const labels = $derived($LL.actionbar.fastWater);
    const times = $derived($fastWaterStore);
    const allowed = $derived($fastWaterRightsStore.allowed);
    let open = $state(false);

    function stop(): void {
        requestFastWater(false);
        open = false;
    }
</script>

<!-- Seen by everyone in the room while the fast water is on: a lake that fills in two minutes is not a bug. -->
{#if times !== undefined}
    <ChipPopover
        label={labels.chip({ times })}
        hint={labels.explain({ times })}
        {compact}
        active={true}
        bind:open
        testid="fast-water-chip"
    >
        {#snippet icon()}
            <IconPlayerTrackNext width="16" height="16" />
        {/snippet}
        <div class="flex max-w-xs flex-col gap-2 text-sm">
            <p class="m-0">{labels.explain({ times })}</p>
            {#if allowed}
                <button type="button" class="btn btn-sm btn-light" data-testid="fast-water-stop" onclick={stop}>
                    {labels.stop()}
                </button>
            {:else}
                <p class="m-0 opacity-80">{labels.onlyEditors()}</p>
            {/if}
        </div>
    </ChipPopover>
{/if}
