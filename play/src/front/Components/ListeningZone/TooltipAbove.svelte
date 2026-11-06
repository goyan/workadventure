<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        /** What the control does, shown above it while the pointer or the keyboard focus is on it. */
        label: string;
        children: Snippet;
    }

    let { label, children }: Props = $props();
</script>

<!-- Pure CSS: the tooltip never takes room in the card, and it shows on keyboard focus as well as on hover. -->
<span class="group/tip relative inline-flex">
    {@render children()}
    <span
        role="tooltip"
        class="pointer-events-none absolute bottom-full left-1/2 z-[500] mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-contrast/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
    >
        {label}
    </span>
</span>
