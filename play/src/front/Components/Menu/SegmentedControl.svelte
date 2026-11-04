<script lang="ts" generics="T extends string | number">
    import type { Component } from "svelte";

    interface Option {
        value: T;
        label: string;
        icon?: Component;
    }

    interface Props {
        value: T;
        options: Option[];
        /** Called after the value changed, like an input's change event. */
        onchange?: () => void;
        ariaLabel: string;
        dataTestId?: string;
    }

    let { value = $bindable(), options, onchange, ariaLabel, dataTestId }: Props = $props();

    function select(next: T): void {
        if (next === value) return;
        value = next;
        onchange?.();
    }
</script>

<div role="radiogroup" aria-label={ariaLabel} class="flex gap-1 rounded-lg bg-black/30 p-1" data-testid={dataTestId}>
    {#each options as option (option.value)}
        {@const selected = option.value === value}
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            class="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold transition-colors {selected
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/60 hover:bg-white/5 hover:text-white'}"
            onclick={() => select(option.value)}
        >
            {#if option.icon}
                {@const Icon = option.icon}
                <span class="shrink-0"><Icon /></span>
            {/if}
            <span class="truncate">{option.label}</span>
        </button>
    {/each}
</div>
