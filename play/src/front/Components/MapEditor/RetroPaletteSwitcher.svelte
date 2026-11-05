<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import { RETRO_PALETTES, retroPaletteStore } from "../../Stores/RetroThemeStore";
    import type { RetroPalette } from "../../Stores/RetroThemeStore";

    // Swatches of the palettes of the 16-bit theme: background, frame and accent of each.
    const SWATCHES: Record<RetroPalette, [string, string, string]> = {
        night: ["#141a29", "#2f3a55", "#4f5ff0"],
        forest: ["#141a29", "#2f3a55", "#3fa76a"],
        ember: ["#141a29", "#2f3a55", "#e07b3c"],
        gameboy: ["#172117", "#344a33", "#8bac0f"],
    };

    function label(palette: RetroPalette): string {
        return $LL.mapEditor.retroTheme.palettes[palette]();
    }
</script>

<div class="flex items-center justify-end gap-2" role="radiogroup" aria-label={$LL.mapEditor.retroTheme.label()}>
    <span class="retro-pixel text-xs text-[var(--rt-muted)]">{$LL.mapEditor.retroTheme.label()}</span>
    {#each RETRO_PALETTES as palette (palette)}
        <button
            type="button"
            role="radio"
            aria-checked={$retroPaletteStore === palette}
            aria-label={label(palette)}
            title={label(palette)}
            data-testid="retroPalette-{palette}"
            class="swatch"
            class:selected={$retroPaletteStore === palette}
            style:--swatch-bg={SWATCHES[palette][0]}
            style:--swatch-frame={SWATCHES[palette][1]}
            style:--swatch-accent={SWATCHES[palette][2]}
            onclick={() => retroPaletteStore.set(palette)}
        ></button>
    {/each}
</div>

<style>
    .swatch {
        width: 18px;
        height: 18px;
        padding: 0;
        cursor: pointer;
        border: 1px solid var(--swatch-frame);
        border-radius: 4px;
        background: linear-gradient(135deg, var(--swatch-bg) 50%, var(--swatch-accent) 50%);
    }

    .swatch.selected,
    .swatch:focus-visible {
        outline: 2px solid var(--rt-accent);
        outline-offset: 2px;
    }
</style>
