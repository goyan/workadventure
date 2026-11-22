<script lang="ts">
    import { untrack } from "svelte";
    import { catastrophePanelStore } from "../../Stores/CatastropheStore";
    import { visualisationPanelStore } from "../../Stores/VisualisationStore";
    import CatastrophePanel from "../Catastrophe/CatastrophePanel.svelte";
    import VisualisationChip from "../Visualisation/VisualisationChip.svelte";
    import { chipsFold, type ChipsFold } from "./ClockLineFold";

    /** The margins of the dock in the main layout (`right-2`, and as much on its left), px. */
    const DOCK_MARGINS_PX = 16;
    /** The width of an icon-only chip before one was measured (px): `h-8`, `px-2`, a 16 px icon. */
    const ICON_CHIP_PX = 32;

    let fold = $state<ChipsFold>("labels");
    let row: HTMLDivElement | undefined = $state();
    // The chips' width with their labels, and with their icons only: measured while drawn so, remembered otherwise.
    let labelled = 0;
    let iconsOnly = 0;

    /**
     * The chips fold to their icons, then to a row of their own, when the clock line is short of room: measured on the
     * other items of the line and the width of the main layout, again whenever one of them changes size.
     */
    $effect(() => {
        const here = row;
        const line = here?.parentElement;
        if (!here || !line) return;
        const dock = line.parentElement;
        const layout = dock?.offsetParent instanceof HTMLElement ? dock.offsetParent : dock?.parentElement;
        const measure = (): void => {
            const style = getComputedStyle(line);
            const gap = parseFloat(style.columnGap) || 8;
            let others = 0;
            let count = 0;
            for (const item of Array.from(line.children)) {
                if (item === here || !(item instanceof HTMLElement) || item.offsetWidth === 0) continue;
                others += item.offsetWidth;
                count++;
            }
            others += Math.max(0, count - 1) * gap;
            // The chips themselves, not their row: in a row of their own it spans the whole line.
            const chips = here.childElementCount;
            let width = Math.max(0, chips - 1) * gap;
            for (const chip of Array.from(here.children)) {
                if (chip instanceof HTMLElement) width += chip.offsetWidth;
            }
            if (fold === "icons") iconsOnly = width;
            else labelled = width;
            const room = (layout?.clientWidth ?? window.innerWidth) - DOCK_MARGINS_PX;
            // Nothing laid out yet: the labels stay.
            if (room <= 0) return;
            const next = chipsFold({
                room,
                others,
                labelled,
                iconsOnly: iconsOnly || chips * ICON_CHIP_PX + Math.max(0, chips - 1) * gap,
                gap,
                column: style.flexDirection.startsWith("column"),
            });
            if (next !== fold) fold = next;
        };
        untrack(measure);
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
        observer?.observe(line);
        observer?.observe(here);
        if (layout) observer?.observe(layout);
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
        };
    });
</script>

<!-- The chips of the disasters and of the visualisation, on the clock line: the last items, so the leftmost of the
     line (it is laid right to left). In a row of their own, they start a new line of the clock line (it wraps). -->
{#if $catastrophePanelStore || $visualisationPanelStore}
    <div
        bind:this={row}
        class="flex items-center gap-2 {fold === 'own-row' ? 'basis-full justify-end' : ''}"
        data-testid="clock-line-chips"
        data-fold={fold}
    >
        <CatastrophePanel compact={fold === "icons"} />
        <VisualisationChip compact={fold === "icons"} />
    </div>
{/if}
