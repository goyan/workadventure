<script lang="ts">
    import { WeatherType } from "@workadventure/map-editor";

    interface Props {
        icon: WeatherType;
        /** Screen pixels: a multiple of 16 keeps the pixel art sharp. */
        size?: number;
    }

    let { icon, size = 32 }: Props = $props();
</script>

<!-- 16x16 pixel art drawn with rects, scaled up without smoothing. -->
<svg width={size} height={size} viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" class="shrink-0">
    {#if icon === WeatherType.Automatic}
        <!-- sun peeking behind a cloud -->
        <g fill="#ffd54a">
            <rect x="3" y="1" width="1" height="2" />
            <rect x="0" y="4" width="2" height="1" />
            <rect x="5" y="0" width="1" height="2" />
            <rect x="2" y="3" width="6" height="5" />
            <rect x="1" y="4" width="8" height="3" />
        </g>
        <g fill="#e8eef5">
            <rect x="5" y="8" width="8" height="5" />
            <rect x="4" y="9" width="10" height="3" />
            <rect x="7" y="6" width="4" height="3" />
        </g>
        <rect x="5" y="13" width="8" height="1" fill="#aab6c4" />
    {:else if icon === WeatherType.Clear}
        <g fill="#ffd54a">
            <rect x="7" y="0" width="2" height="2" />
            <rect x="7" y="14" width="2" height="2" />
            <rect x="0" y="7" width="2" height="2" />
            <rect x="14" y="7" width="2" height="2" />
            <rect x="2" y="2" width="2" height="2" />
            <rect x="12" y="2" width="2" height="2" />
            <rect x="2" y="12" width="2" height="2" />
            <rect x="12" y="12" width="2" height="2" />
            <rect x="5" y="4" width="6" height="8" />
            <rect x="4" y="5" width="8" height="6" />
        </g>
    {:else if icon === WeatherType.Rain}
        <g fill="#cfd8e3">
            <rect x="3" y="3" width="10" height="5" />
            <rect x="2" y="4" width="12" height="3" />
            <rect x="5" y="2" width="5" height="2" />
        </g>
        <g fill="#5aa9ff">
            <rect x="4" y="10" width="1" height="3" />
            <rect x="8" y="9" width="1" height="3" />
            <rect x="11" y="11" width="1" height="3" />
            <rect x="6" y="13" width="1" height="2" />
        </g>
    {:else if icon === WeatherType.Storm}
        <g fill="#8d99a8">
            <rect x="3" y="2" width="10" height="5" />
            <rect x="2" y="3" width="12" height="3" />
            <rect x="5" y="1" width="5" height="2" />
        </g>
        <g fill="#ffd54a">
            <rect x="8" y="7" width="3" height="2" />
            <rect x="6" y="9" width="4" height="2" />
            <rect x="8" y="11" width="3" height="1" />
            <rect x="6" y="12" width="2" height="2" />
            <rect x="5" y="14" width="1" height="1" />
        </g>
    {:else if icon === WeatherType.Snow}
        <g fill="#e6f3ff">
            <rect x="7" y="1" width="2" height="14" />
            <rect x="1" y="7" width="14" height="2" />
            <rect x="3" y="3" width="2" height="2" />
            <rect x="11" y="3" width="2" height="2" />
            <rect x="3" y="11" width="2" height="2" />
            <rect x="11" y="11" width="2" height="2" />
            <rect x="5" y="5" width="1" height="1" />
            <rect x="10" y="5" width="1" height="1" />
            <rect x="5" y="10" width="1" height="1" />
            <rect x="10" y="10" width="1" height="1" />
        </g>
    {:else if icon === WeatherType.Real}
        <!-- small sun and a map pin: the weather of a real place -->
        <g fill="#ffd54a">
            <rect x="10" y="1" width="4" height="4" />
            <rect x="9" y="2" width="6" height="2" />
            <rect x="11" y="0" width="2" height="6" />
        </g>
        <g fill="#ff6b6b">
            <rect x="3" y="4" width="6" height="6" />
            <rect x="2" y="5" width="8" height="4" />
            <rect x="4" y="10" width="4" height="2" />
            <rect x="5" y="12" width="2" height="2" />
        </g>
        <rect x="5" y="6" width="2" height="2" fill="#ffffff" />
        <rect x="2" y="15" width="8" height="1" fill="#aab6c4" />
    {:else if icon === WeatherType.Fog}
        <g fill="#dfe6ee">
            <rect x="2" y="3" width="10" height="2" />
            <rect x="4" y="7" width="10" height="2" />
            <rect x="1" y="11" width="11" height="2" />
        </g>
    {/if}
</svg>
