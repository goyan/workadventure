<script lang="ts">
    import { get } from "svelte/store";
    import { LL } from "../../../i18n/i18n-svelte";
    import { basicActiveStore } from "../../Stores/BasicModeStore";
    import { gameSceneStore } from "../../Stores/GameSceneStore";
    import { rainbowSpotStore } from "../../Stores/WeatherStore";

    /** Takes the avatar under the top of the rainbow, on the nearest free tile. */
    function goToRainbow(): void {
        const spot = get(rainbowSpotStore);
        if (spot) get(gameSceneStore)?.teleportNextTo(spot, 0);
    }
</script>

{#if $rainbowSpotStore && !$basicActiveStore}
    <button
        type="button"
        class="h-8 w-8 rounded-full bg-contrast/80 text-base backdrop-blur hover:bg-contrast"
        title={$LL.menu.settings.goToRainbow()}
        aria-label={$LL.menu.settings.goToRainbow()}
        data-testid="rainbow-button"
        onclick={goToRainbow}
    >
        🌈
    </button>
{/if}
