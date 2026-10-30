<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        tooltipTitle?: string;
        tooltip?: Snippet;
        children?: Snippet;
        wrapperDiv?: HTMLElement;
    }

    let { tooltipTitle, tooltip, children, wrapperDiv = $bindable() }: Props = $props();
</script>

<div bind:this={wrapperDiv}>
    <h1>{tooltipTitle}</h1>
    {@render children?.()}
    {@render tooltip?.()}
</div>
