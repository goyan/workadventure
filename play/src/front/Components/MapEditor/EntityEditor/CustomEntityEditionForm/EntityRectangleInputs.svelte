<script lang="ts">
    import type { CollisionRectangle } from "@workadventure/map-editor";
    import LL from "../../../../../i18n/i18n-svelte";
    import Input from "../../../Input/Input.svelte";

    // Position and size, in pixels of the image, of a hitbox or water rectangle.
    interface Props {
        rectangle: CollisionRectangle;
        maxWidth: number;
        maxHeight: number;
    }

    let { rectangle = $bindable(), maxWidth, maxHeight }: Props = $props();

    function set(field: keyof CollisionRectangle, raw: string | number | null | undefined) {
        const value = Math.round(Number(raw));
        if (!Number.isFinite(value)) return;
        const max = field === "x" || field === "width" ? maxWidth : maxHeight;
        const min = field === "width" || field === "height" ? 1 : 0;
        rectangle = { ...rectangle, [field]: Math.min(Math.max(value, min), max) };
    }
</script>

<div class="grid grid-cols-4 gap-1">
    {#each ["x", "y", "width", "height"] as const as field (field)}
        <Input
            id={`rectangle-${field}`}
            dataTestId={`rectangle-${field}`}
            label={$LL.mapEditor.entityEditor.customEntityEditorForm.rectangle[field]()}
            type="number"
            min={field === "width" || field === "height" ? 1 : 0}
            step={1}
            value={rectangle[field]}
            onchange={(event?: Event) => set(field, (event?.target as HTMLInputElement | undefined)?.value)}
        />
    {/each}
</div>
