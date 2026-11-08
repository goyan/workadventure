<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { ChristmasThemeMode } from "../../Phaser/Game/Christmas/ChristmasSeason";
    import { christmasThemeModeStore } from "../../Stores/ChristmasThemeStore";
    import SegmentedControl from "./SegmentedControl.svelte";
</script>

<SegmentedControl
    ariaLabel={$LL.menu.settings.christmas.label()}
    bind:value={$christmasThemeModeStore}
    dataTestId="christmas-theme-control"
    options={[
        { value: ChristmasThemeMode.Auto, label: $LL.menu.settings.christmas.auto() },
        { value: ChristmasThemeMode.Always, label: $LL.menu.settings.christmas.always() },
        { value: ChristmasThemeMode.Never, label: $LL.menu.settings.christmas.never() },
    ]}
/>
