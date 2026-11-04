<script lang="ts">
    import type { Snippet } from "svelte";

    interface Props {
        title: string;
        description?: string;
        icon?: Snippet;
        children: Snippet;
        dataTestId?: string;
        /** The section element, for callers that scroll to it. */
        element?: HTMLElement;
    }

    let { title, description, icon, children, dataTestId, element = $bindable() }: Props = $props();
</script>

<!-- A settings card: header (icon, title, description), then rows separated by hairlines. -->
<section
    bind:this={element}
    class="m-0 overflow-hidden rounded-xl border border-solid border-white/10 bg-white/[0.03] p-0"
    data-testid={dataTestId}
>
    <header class="flex items-center gap-3 border-0 border-b border-solid border-white/10 px-5 py-4">
        {#if icon}
            <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80">
                {@render icon()}
            </div>
        {/if}
        <div class="min-w-0">
            <h3 class="m-0 p-0 text-base font-bold text-white">{title}</h3>
            {#if description}
                <p class="m-0 mt-0.5 text-sm font-normal text-white/60">{description}</p>
            {/if}
        </div>
    </header>
    <div class="settings-rows flex flex-col">
        {@render children()}
    </div>
</section>

<style>
    /* Each direct child is a row: the same padding everywhere, a hairline between rows. */
    .settings-rows > :global(*) {
        padding: 1rem 1.25rem;
    }
    .settings-rows > :global(* + *) {
        border-top: 1px solid rgb(255 255 255 / 0.05);
    }
</style>
