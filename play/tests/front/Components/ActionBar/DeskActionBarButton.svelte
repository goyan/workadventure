<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        tooltipTitle?: string;
        desc?: string;
        tooltipShortcuts?: string[];
        state?: string;
        dataTestId?: string;
        onclick?: (event: MouseEvent) => void;
        children?: Snippet;
    }

    let { tooltipTitle, desc, tooltipShortcuts = [], state, dataTestId, onclick, children }: Props = $props();
</script>

<button type="button" data-testid={dataTestId} data-state={state} {onclick}>
    <span data-title>{tooltipTitle}</span>
    <span data-desc>{desc}</span>
    <span data-shortcuts>{tooltipShortcuts.join("+")}</span>
    {@render children?.()}
</button>
