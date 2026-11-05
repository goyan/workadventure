<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import { RETRO_PALETTES, retroPaletteStore } from "../../Stores/RetroThemeStore";
    import type { RetroPalette } from "../../Stores/RetroThemeStore";

    const SWATCHES: Record<RetroPalette, [string, string]> = {
        night: ["#141a29", "#4f5ff0"],
        forest: ["#14271a", "#3fa76a"],
        ember: ["#291d19", "#e07b3c"],
        gameboy: ["#172117", "#8bac0f"],
        light: ["#f5f7fc", "#4f5ff0"],
    };
</script>

<div class="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={$LL.menu.settings.theme.label()}>
    {#each RETRO_PALETTES as palette (palette)}
        <label
            class="retro-choice flex items-center gap-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary"
            class:selected={$retroPaletteStore === palette}
        >
            <input
                type="radio"
                name="interface-theme"
                value={palette}
                checked={$retroPaletteStore === palette}
                onchange={() => retroPaletteStore.set(palette)}
                class="sr-only"
                data-testid="retroPalette-{palette}"
            />
            <span
                class="h-7 w-7 shrink-0 rounded border border-solid border-[var(--rt-line-strong)]"
                style:background={`linear-gradient(135deg, ${SWATCHES[palette][0]} 50%, ${SWATCHES[palette][1]} 50%)`}
                aria-hidden="true"
            ></span>
            {$LL.menu.settings.theme.palettes[palette]()}
        </label>
    {/each}
</div>
