<script lang="ts">
    import { LL } from "../../../../../i18n/i18n-svelte";

    interface Props {
        /** The chosen view: Down (front), Up (back), Left or Right. */
        value: string;
        /** Views the object already has: picking one would hide its image, so they cannot be chosen. */
        takenViews?: string[];
        onChange: (view: string) => void;
    }

    let { value, takenViews = [], onChange }: Props = $props();

    const options = $derived([
        { value: "Down", label: $LL.mapEditor.entityEditor.views.front() },
        { value: "Up", label: $LL.mapEditor.entityEditor.views.back() },
        { value: "Left", label: $LL.mapEditor.entityEditor.views.left() },
        { value: "Right", label: $LL.mapEditor.entityEditor.views.right() },
    ]);
</script>

<div class="flex flex-col gap-1">
    <span class="retro-label">{$LL.mapEditor.entityEditor.views.label()}</span>
    <div class="retro-choices" role="radiogroup" data-testid="entityView">
        {#each options as option (option.value)}
            {@const taken = takenViews.includes(option.value)}
            <button
                type="button"
                role="radio"
                aria-checked={value === option.value}
                disabled={taken}
                class="retro-choice"
                class:selected={value === option.value}
                class:opacity-50={taken}
                class:cursor-not-allowed={taken}
                onclick={() => onChange(option.value)}
            >
                {option.label}
                {#if taken}
                    <span class="block text-xxs opacity-80">{$LL.mapEditor.entityEditor.views.taken()}</span>
                {/if}
            </button>
        {/each}
    </div>
</div>
