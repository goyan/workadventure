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
    <button type="button" class="retro-tile" class:special data-testid="entityCategory" onclick={onSelect}>
        <div class="grid grid-cols-2 gap-1 w-full aspect-square bg-black/25 p-1 tile-previews">
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
            <span class="retro-pixel tile-label truncate">{label}</span>
            <span class="text-xs text-[var(--rt-muted)]"
                >{entitiesPrefabsVariants.length}
                {$LL.mapEditor.entityEditor.images(entitiesPrefabsVariants.length)}</span
            >
        </span>
    </button>
</li>

<style>
    .retro-tile {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: 100%;
        height: 100%;
        padding: 0.5rem;
        text-align: start;
        color: var(--rt-text);
        background: var(--rt-surface);
        border: 1px solid var(--rt-line);
        border-radius: var(--rt-radius-m);
        cursor: pointer;
        transition:
            background 0.15s var(--rt-ease),
            border-color 0.15s var(--rt-ease),
            transform 0.15s var(--rt-ease);
    }

    .retro-tile.special {
        background: var(--rt-bg-deep);
    }

    .retro-tile:hover {
        border-color: var(--rt-accent);
        background: var(--rt-surface-raised);
        transform: translateY(-1px);
    }

    .tile-previews {
        border-radius: var(--rt-radius-s);
    }

    .tile-previews :global(img),
    .tile-previews :global(canvas) {
        image-rendering: pixelated;
    }

    .tile-label {
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--rt-text);
    }

    @media (prefers-reduced-motion: reduce) {
        .retro-tile {
            transition: none;
        }

        .retro-tile:hover {
            transform: none;
        }
    }
</style>
