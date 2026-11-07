<script lang="ts">
    import { computePosition, flip, offset, shift } from "@floating-ui/dom";
    import type { Snippet } from "svelte";

    interface Props {
        /** What the control does, shown above it while the pointer or the keyboard focus is on it. */
        label: string;
        children: Snippet;
    }

    let { label, children }: Props = $props();

    let anchor = $state<HTMLElement>();
    let tooltip = $state<HTMLElement>();
    let open = $state(false);
    let x = $state(0);
    let y = $state(0);

    // Drawn on the page and not in the card: the panel around the card scrolls, and would cut a tooltip that sticks out.
    function toBody(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    $effect(() => {
        if (!open || !anchor || !tooltip) {
            return;
        }
        computePosition(anchor, tooltip, {
            placement: "top",
            strategy: "fixed",
            middleware: [offset(6), flip(), shift({ padding: 8 })],
        })
            .then((position) => {
                x = position.x;
                y = position.y;
            })
            .catch((error) => console.error("Cannot place the tooltip", error));
    });
</script>

<!-- Shows on hover as well as on keyboard focus; the anchor only listens, the control inside stays the one to act on. -->
<span
    bind:this={anchor}
    role="presentation"
    class="inline-flex"
    onmouseenter={() => (open = true)}
    onmouseleave={() => (open = false)}
    onfocusin={() => (open = true)}
    onfocusout={() => (open = false)}
>
    {@render children()}
</span>
{#if open}
    <span
        use:toBody
        bind:this={tooltip}
        role="tooltip"
        style="position: fixed; left: {x}px; top: {y}px;"
        class="pointer-events-none z-[1000] whitespace-nowrap rounded-md bg-contrast/90 px-2 py-1 text-xs text-white"
    >
        {label}
    </span>
{/if}
