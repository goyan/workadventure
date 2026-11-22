<script lang="ts">
    import { IconInfoCircle } from "@wa-icons";

    interface Props {
        /** The accessible name of the button ("How to throw it"). */
        label: string;
        /** The help itself, shown in the bubble and read as the description of the button. */
        text: string;
        testid: string;
    }

    let { label, text, testid }: Props = $props();

    // Shown while hovered, while focused (keyboard), or pinned by a click or a tap (touch screens have no hover).
    let hovered = $state(false);
    let focused = $state(false);
    let pinned = $state(false);
    const shown = $derived(hovered || focused || pinned);
    let root: HTMLSpanElement | undefined = $state();
    const id = $props.id();

    // A press elsewhere lets the pinned bubble go.
    $effect(() => {
        if (!pinned) return;
        const onPointerdown = (event: PointerEvent): void => {
            if (!(event.target instanceof Node) || !root?.contains(event.target)) pinned = false;
        };
        window.addEventListener("pointerdown", onPointerdown, true);
        return () => window.removeEventListener("pointerdown", onPointerdown, true);
    });
</script>

<span class="relative inline-flex shrink-0" bind:this={root}>
    <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-pop-green {pinned
            ? 'bg-white/20 text-white'
            : ''}"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={pinned}
        data-testid={testid}
        onmouseenter={() => (hovered = true)}
        onmouseleave={() => (hovered = false)}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        onclick={() => (pinned = !pinned)}
    >
        <IconInfoCircle font-size="16" />
    </button>
    <!-- Always in the page, so that the button reads it as its description; drawn only while asked for. -->
    <span
        {id}
        role="tooltip"
        class="absolute end-0 top-full z-10 mt-1 w-64 max-w-[calc(100vw-16px)] rounded-lg bg-contrast p-2 text-xs font-normal leading-snug text-white shadow-lg {shown
            ? ''
            : 'hidden'}"
        data-testid="{testid}-text"
        data-shown={shown ? "true" : "false"}
    >
        {text}
    </span>
</span>
