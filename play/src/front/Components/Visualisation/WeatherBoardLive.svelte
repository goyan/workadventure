<script lang="ts">
    import { weatherBoardNow } from "@wa/front/Phaser/Game/Weather/WeatherBoardNow";
    import { gameManager } from "../../Phaser/Game/GameManager";
    import { nightDateStore } from "../../Stores/NightStore";
    import WeatherBoard from "./WeatherBoard.svelte";

    /**
     * The weather board of now: read again at each tick of the game clock (every second), only while it is open (it
     * is not mounted otherwise).
     */
    const board = $derived.by(() => {
        const date = $nightDateStore;
        if (!date) return undefined;
        const scene = gameManager.getCurrentGameScene();
        return weatherBoardNow(
            scene.getGameMap().getWamFile()?.getWam().settings,
            date,
            scene.getMeadow(),
            scene.CurrentPlayer,
        );
    });
</script>

{#if board}
    <WeatherBoard {board} />
{/if}
