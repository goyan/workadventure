<script lang="ts">
    import LL from "../../../i18n/i18n-svelte";
    import { UI_FONTS, uiFontStore } from "../../Stores/RetroThemeStore";
</script>

<div class="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label={$LL.menu.settings.font.label()}>
    {#each UI_FONTS as font (font)}
        <label
            class="retro-choice flex items-center gap-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-secondary"
            class:selected={$uiFontStore === font}
        >
            <input
                type="radio"
                name="interface-font"
                value={font}
                checked={$uiFontStore === font}
                onchange={() => uiFontStore.set(font)}
                class="sr-only"
                data-testid="uiFont-{font}"
            />
            <span class="shrink-0 text-lg" data-font-preview={font} aria-hidden="true">Aa</span>
            <span data-font-preview={font}>{$LL.menu.settings.font.choices[font]()}</span>
        </label>
    {/each}
</div>
