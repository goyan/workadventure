<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        tooltipTitle?: string;
        tooltipDesc?: string;
        media?: string;
        state?: string;
        classList?: string;
        children?: Snippet;
        wrapperDiv?: HTMLElement;
    }

    let { tooltipTitle, tooltipDesc, media, state, classList, children, wrapperDiv = $bindable() }: Props = $props();
</script>

<div bind:this={wrapperDiv} data-state={state} data-class={classList}>
    <h1>{tooltipTitle}</h1>
    <p>{tooltipDesc}</p>
    {#if media}
        <div data-help-media={media}></div>
    {/if}
    {@render children?.()}
</div>
