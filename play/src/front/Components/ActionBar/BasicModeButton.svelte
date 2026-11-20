<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { basicModeStore } from "../../Stores/BasicModeStore";
    import ActionBarButton from "./ActionBarButton.svelte";
    import { IconWand, IconWandOff } from "@wa-icons";

    const labels = $derived($LL.actionbar.basicMode);
</script>

<!-- Always within reach: « Basique » hides every effect for this person only, without touching their settings. -->
<ActionBarButton
    onclick={() => basicModeStore.update((on) => !on)}
    tooltipTitle={labels.label()}
    desc={$basicModeStore ? labels.on() : labels.off()}
    state={$basicModeStore ? "active" : "normal"}
    dataTestId="basic-mode-button"
>
    <!-- The wand of the effects: crossed out while Basique hides them. -->
    {#if $basicModeStore}
        <IconWandOff width="20" height="20" />
    {:else}
        <IconWand width="20" height="20" />
    {/if}
</ActionBarButton>
