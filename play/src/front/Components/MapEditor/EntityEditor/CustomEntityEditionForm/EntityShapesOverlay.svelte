<script lang="ts">
    import type { CollisionRectangle } from "@workadventure/map-editor";

    // Draws the hitbox (red) and the water (blue) over the preview of the image, which is shown `object-contain`
    // in a 128px wide box: the shapes are scaled and centered like the image.
    interface Props {
        frameWidth: number;
        frameHeight: number;
        displayedHeight: number;
        hitbox: CollisionRectangle[];
        water: CollisionRectangle[];
    }

    let { frameWidth, frameHeight, displayedHeight, hitbox, water }: Props = $props();

    const BOX_WIDTH = 128;
    const scale = $derived(frameHeight > 0 ? displayedHeight / frameHeight : 0);
    const contentWidth = $derived(Math.min(BOX_WIDTH, frameWidth * scale));
    const offsetX = $derived((BOX_WIDTH - contentWidth) / 2);

    function boxStyle(rectangle: CollisionRectangle): string {
        return [
            `left: ${offsetX + rectangle.x * scale}px`,
            `top: ${rectangle.y * scale}px`,
            `width: ${rectangle.width * scale}px`,
            `height: ${rectangle.height * scale}px`,
        ].join(";");
    }
</script>

{#if scale > 0}
    <div class="absolute top-0 left-0 w-32 pointer-events-none" style:height="{displayedHeight}px">
        {#each water as rectangle, index (index)}
            <div class="absolute border border-solid border-sky-300 bg-sky-400/40" style={boxStyle(rectangle)}></div>
        {/each}
        {#each hitbox as rectangle, index (index)}
            <div class="absolute border border-solid border-red-400 bg-red-600/40" style={boxStyle(rectangle)}></div>
        {/each}
    </div>
{/if}
