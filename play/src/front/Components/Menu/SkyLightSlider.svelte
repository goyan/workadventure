<script lang="ts">
    import type { Writable } from "svelte/store";
    import RangeSlider from "../Input/RangeSlider.svelte";

    interface Props {
        id: string;
        label: string;
        store: Writable<number>;
        min: number;
        max: number;
        step: number;
        shown: (value: number) => string;
    }

    let { id, label, store, min, max, step, shown }: Props = $props();
</script>

<div class="flex flex-col gap-1">
    <span class="text-sm text-white">{label}</span>
    <div class="flex items-center gap-4">
        <div class="grow">
            <RangeSlider {id} {min} {max} {step} bind:value={$store} />
        </div>
        <span class="w-20 shrink-0 text-end text-xs text-white/50 tabular-nums">{shown($store)}</span>
    </div>
</div>
