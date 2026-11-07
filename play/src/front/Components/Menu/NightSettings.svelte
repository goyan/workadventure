<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { NightMode, nightModeStore } from "../../Stores/NightStore";
    import SegmentedControl from "./SegmentedControl.svelte";
</script>

<SegmentedControl
    ariaLabel={$LL.menu.settings.night.label()}
    bind:value={$nightModeStore}
    dataTestId="night-mode-control"
    options={[
        { value: NightMode.Server, label: $LL.menu.settings.night.server() },
        { value: NightMode.Computer, label: $LL.menu.settings.night.computer() },
        { value: NightMode.Disabled, label: $LL.menu.settings.night.disabled() },
    ]}
/>
