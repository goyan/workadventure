<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { JamStyle, JamTheme, jamStyleStore, jamThemeStore } from "../../ListeningZone/JamThemeStore";
    import { lampEffectsEnabledStore } from "../../Stores/LampEffectsStore";
    import LightEffectsToggle from "./LightEffectsToggle.svelte";
    import { IconBrandApple, IconBrandSpotify, IconMoon, IconSun, IconSunMoon } from "@wa-icons";

    let apple = $derived($jamStyleStore === JamStyle.AppleMusic);
    let styleLabel = $derived(
        apple ? $LL.spotify.listeningZone.styleSpotify() : $LL.spotify.listeningZone.styleAppleMusic(),
    );
</script>

<div class="jam-theme-picker" role="group" aria-label={$LL.spotify.listeningZone.theme()}>
    <span aria-hidden="true">{$LL.spotify.listeningZone.theme()}</span>
    <div class="jam-theme-segments">
        {#each [JamTheme.Wa, JamTheme.Dark, JamTheme.Light] as theme (theme)}
            {@const label =
                theme === JamTheme.Wa
                    ? $LL.spotify.listeningZone.themeWa()
                    : theme === JamTheme.Dark
                      ? $LL.spotify.listeningZone.themeDark()
                      : $LL.spotify.listeningZone.themeLight()}
            <button
                type="button"
                aria-label={label}
                title={label}
                aria-pressed={$jamThemeStore === theme}
                data-testid="jam-theme-{theme}"
                onclick={() => jamThemeStore.set(theme)}
            >
                {#if theme === JamTheme.Wa}<IconSunMoon font-size="16" />{:else if theme === JamTheme.Dark}<IconMoon
                        font-size="16"
                    />{:else}<IconSun font-size="16" />{/if}
            </button>
        {/each}
    </div>
    <button
        type="button"
        class="jam-style-toggle"
        aria-label={styleLabel}
        title={styleLabel}
        aria-pressed={apple}
        data-testid="jam-style-toggle"
        onclick={() => jamStyleStore.set(apple ? JamStyle.Spotify : JamStyle.AppleMusic)}
    >
        {#if apple}<IconBrandApple font-size="18" />{:else}<IconBrandSpotify font-size="18" />{/if}
    </button>
    <!-- The light effects of the lamps, for me only: with the other settings of the look of the lounge. -->
    <LightEffectsToggle
        on={$lampEffectsEnabledStore}
        label={$lampEffectsEnabledStore
            ? $LL.spotify.listeningZone.lightsDisable()
            : $LL.spotify.listeningZone.lightsEnable()}
        onclick={() => lampEffectsEnabledStore.update((enabled) => !enabled)}
        testid="jam-lights-toggle"
    />
</div>
