<script lang="ts">
    import type { WindArrow } from "@wa/front/Phaser/Game/Weather/WindDirection";

    interface Props {
        /** Where the wind goes, north up as on the map. */
        arrow: WindArrow;
        size?: number;
        class?: string;
        testid?: string;
    }

    let { arrow, size = 16, class: className = "", testid }: Props = $props();

    function windArrowStyle(shown: WindArrow): string {
        return `rotate(${shown.quarterTurns * 90}deg)`;
    }
</script>

<!-- A pixel arrow pointing where the wind goes, in the 16x16 pixel art of the weather icons. -->
<svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    shape-rendering="crispEdges"
    aria-hidden="true"
    class="shrink-0 {className}"
    style:transform={windArrowStyle(arrow)}
    data-towards={arrow.towards}
    data-testid={testid}
>
    <g fill="#cfd8e3">
        {#if arrow.diagonal}
            <!-- pointing north-east: a two-pixel head in the corner and a stepped shaft -->
            <rect x="7" y="2" width="7" height="2" />
            <rect x="12" y="2" width="2" height="7" />
            {#each [0, 1, 2, 3, 4, 5, 6, 7] as step (step)}
                <rect x={3 + step} y={12 - step} width="2" height="1" />
            {/each}
        {:else}
            <!-- pointing north: a head of four rows and a shaft two pixels wide -->
            <rect x="7" y="1" width="2" height="1" />
            <rect x="6" y="2" width="4" height="1" />
            <rect x="5" y="3" width="6" height="1" />
            <rect x="4" y="4" width="8" height="1" />
            <rect x="7" y="5" width="2" height="10" />
        {/if}
    </g>
</svg>
