<script lang="ts">
    import type { EntityPrefab } from "@workadventure/map-editor";
    import { LL } from "../../../../../i18n/i18n-svelte";
    import EntityImage from "./EntityImage.svelte";

    interface Props {
        entityPrefabsPositions: EntityPrefab[];
        selectedEntity: EntityPrefab;
        onPickItem: (entity: EntityPrefab) => void;
    }

    let { entityPrefabsPositions, selectedEntity, onPickItem }: Props = $props();

    // The views of an object (front, back, left, right): a real button each, with its image and its name.
    const viewNames = $derived({
        Down: $LL.mapEditor.entityEditor.views.front(),
        Up: $LL.mapEditor.entityEditor.views.back(),
        Left: $LL.mapEditor.entityEditor.views.left(),
        Right: $LL.mapEditor.entityEditor.views.right(),
    });
</script>

{#if entityPrefabsPositions.length > 1}
    <p class="m-0 mt-1 text-xxs opacity-80">{$LL.mapEditor.entityEditor.views.label()}</p>
    <div class="flex flex-row flex-wrap gap-2 mt-1">
        {#each entityPrefabsPositions as item (item.id)}
            {@const selected = item.imagePath === selectedEntity?.imagePath}
            <button
                type="button"
                aria-pressed={selected}
                title={item.name}
                class={`m-0 flex w-16 flex-col items-center gap-1 rounded-md border-2 border-solid p-1 transition-colors ${
                    selected
                        ? "border-yellow-400 bg-white/20"
                        : "border-white/20 bg-white/5 hover:border-white/50 hover:bg-white/10"
                }`}
                onclick={() => onPickItem(item)}
            >
                <EntityImage
                    classNames="h-10 w-14 object-contain pointer-events-none"
                    imageSource={item.imagePath}
                    animation={item.animation}
                    imageAlt=""
                />
                <span class="text-xxs leading-none">{viewNames[item.direction]}</span>
            </button>
        {/each}
    </div>
{/if}
