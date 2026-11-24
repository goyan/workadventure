<script lang="ts">
    import { basicModeStore } from "../../Stores/BasicModeStore";
    import FastDayWidget from "./FastDayWidget.svelte";
    import MapClockWidget from "./MapClockWidget.svelte";
</script>

<!-- The day sped up for oneself, then the clocks of the map (the cold), left of the wand of the effects; neither in
     Basique, which hides every effect. -->
{#if !$basicModeStore}
    <div class="flex items-center" data-testid="action-bar-clocks"><FastDayWidget /></div>
    <div class="flex items-center"><MapClockWidget /></div>
{/if}
