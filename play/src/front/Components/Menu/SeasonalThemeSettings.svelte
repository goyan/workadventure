<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { SeasonalThemeMode } from "../../Phaser/Game/Seasonal/SeasonalTheme";
    import { seasonalThemeModeStore } from "../../Stores/SeasonalThemeStore";
    import SegmentedControl from "./SegmentedControl.svelte";

    const hint = $derived(
        {
            [SeasonalThemeMode.Auto]: $LL.menu.settings.seasonal.hintAuto(),
            [SeasonalThemeMode.Autumn]: $LL.menu.settings.seasonal.hintAutumn(),
            [SeasonalThemeMode.Christmas]: $LL.menu.settings.seasonal.hintChristmas(),
            [SeasonalThemeMode.None]: $LL.menu.settings.seasonal.hintNone(),
        }[$seasonalThemeModeStore],
    );
</script>

<SegmentedControl
    ariaLabel={$LL.menu.settings.seasonal.label()}
    bind:value={$seasonalThemeModeStore}
    dataTestId="seasonal-theme-control"
    options={[
        { value: SeasonalThemeMode.Auto, label: $LL.menu.settings.seasonal.auto() },
        { value: SeasonalThemeMode.Autumn, label: $LL.menu.settings.seasonal.autumn() },
        { value: SeasonalThemeMode.Christmas, label: $LL.menu.settings.seasonal.christmas() },
        { value: SeasonalThemeMode.None, label: $LL.menu.settings.seasonal.none() },
    ]}
/>
<p class="m-0 text-xs text-white/60">{hint}</p>
