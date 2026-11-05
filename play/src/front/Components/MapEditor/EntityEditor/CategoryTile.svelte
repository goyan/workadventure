<script lang="ts">
    import type { EntityVariant } from "../../../Phaser/Game/MapEditor/Entities/EntityVariant";
    import LL from "../../../../i18n/i18n-svelte";
    import EntityImage from "./EntityItem/EntityImage.svelte";

    // A category of the object library: a preview of its first objects, its name and how many it holds.
    interface Props {
        label: string;
        entitiesPrefabsVariants: EntityVariant[];
        special?: boolean;
        onSelect: () => void;
    }

    let { label, entitiesPrefabsVariants, special = false, onSelect }: Props = $props();

    const previews = $derived(entitiesPrefabsVariants.slice(0, 4));
</script>

<li class="m-0">
    <button
        type="button"
        class="w-full h-full flex flex-col gap-2 p-2 rounded-lg text-start text-white cursor-pointer transition-colors {special
            ? 'bg-white/5 hover:bg-white/15'
            : 'bg-white/10 hover:bg-white/20'}"
        data-testid="entityCategory"
        onclick={onSelect}
    >
        <div class="grid grid-cols-2 gap-1 w-full aspect-square bg-black/20 rounded p-1">
            {#each previews as variant (variant.id)}
                <div class="flex items-center justify-center overflow-hidden">
                    <EntityImage
                        classNames="max-w-full max-h-full object-contain"
                        imageSource={variant.defaultPrefab.imagePath}
                        animation={variant.defaultPrefab.animation}
                        imageAlt={variant.defaultPrefab.name}
                    />
                </div>
            {/each}
        </div>
        <span class="flex flex-col min-w-0">
            <span class="font-bold truncate">{label}</span>
            <span class="text-xs opacity-60"
                >{entitiesPrefabsVariants.length}
                {$LL.mapEditor.entityEditor.images(entitiesPrefabsVariants.length)}</span
            >
        </span>
    </button>
</li>
