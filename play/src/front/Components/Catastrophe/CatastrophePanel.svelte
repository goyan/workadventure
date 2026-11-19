<script lang="ts">
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        armedCatastropheStore,
        catastrophePanelStore,
        disarmCatastrophe,
        toggleArmedCatastrophe,
    } from "../../Stores/CatastropheStore";
    import { mapEditorModeStore } from "../../Stores/MapEditorStore";
    import PixelIcon from "../ActionsMenu/PixelIcon.svelte";

    const shown = $derived($catastrophePanelStore && !$mapEditorModeStore);
    const meteorArmed = $derived($armedCatastropheStore === "meteor");

    // Escape only matters while something is armed: the listener lives exactly that long.
    function onKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") disarmCatastrophe();
    }
    $effect(() => {
        if ($armedCatastropheStore === undefined) return;
        window.addEventListener("keydown", onKeydown);
        return () => window.removeEventListener("keydown", onKeydown);
    });

    onDestroy(disarmCatastrophe);
</script>

{#if shown}
    <div
        class="pointer-events-auto flex items-center gap-3 rounded-full bg-contrast/80 py-1 pe-3 ps-1 text-xs backdrop-blur"
        role="group"
        aria-label={$LL.actionbar.catastrophe.label()}
        data-testid="catastrophe-panel"
    >
        <button
            type="button"
            class="flex items-center gap-1 rounded-full px-2 py-1 {meteorArmed
                ? 'bg-white/30 ring-1 ring-white'
                : 'bg-white/10 hover:bg-white/20'}"
            aria-pressed={meteorArmed}
            data-testid="catastrophe-meteor"
            onclick={() => toggleArmedCatastrophe("meteor")}
        >
            <PixelIcon name="meteor" size={16} />
            <span>{$LL.actionbar.catastrophe.meteor()}</span>
        </button>
        <span class="text-white/60">
            {meteorArmed ? $LL.actionbar.catastrophe.armedHelp() : $LL.actionbar.catastrophe.idleHelp()}
        </span>
    </div>
{/if}
