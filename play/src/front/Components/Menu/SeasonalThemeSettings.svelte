<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import {
        SeasonalThemeMode,
        shownSeasonalThemeMode,
        WINTER_THEME_ENABLED,
    } from "../../Phaser/Game/Seasonal/SeasonalTheme";
    import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
    import SegmentedControl from "./SegmentedControl.svelte";

    // A saved Christmas choice shows as auto while the winter theme is off, and stays saved until another choice.
    const shown = $derived(shownSeasonalThemeMode($seasonalThemeModeStore));

    const hint = $derived(
        {
            [SeasonalThemeMode.Auto]: $LL.menu.settings.seasonal.hintAuto(),
            [SeasonalThemeMode.Autumn]: $LL.menu.settings.seasonal.hintAutumn(),
            [SeasonalThemeMode.Christmas]: $LL.menu.settings.seasonal.hintChristmas(),
            [SeasonalThemeMode.None]: $LL.menu.settings.seasonal.hintNone(),
        }[shown],
    );

    const options = $derived([
        { value: SeasonalThemeMode.Auto, label: $LL.menu.settings.seasonal.auto() },
        { value: SeasonalThemeMode.Autumn, label: $LL.menu.settings.seasonal.autumn() },
        ...(WINTER_THEME_ENABLED
            ? [{ value: SeasonalThemeMode.Christmas, label: $LL.menu.settings.seasonal.christmas() }]
            : []),
        { value: SeasonalThemeMode.None, label: $LL.menu.settings.seasonal.none() },
    ]);
</script>

<SegmentedControl
    ariaLabel={$LL.menu.settings.seasonal.label()}
    bind:value={() => shown, (mode) => seasonalThemeModeStore.set(mode)}
    dataTestId="seasonal-theme-control"
    {options}
/>
<p class="m-0 text-xs text-white/60">{hint}</p>
