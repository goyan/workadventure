<script lang="ts">
    import type { Snippet } from "svelte";
    import { popoverPlacement, type PopoverPlacement } from "./ClockLineFold";

    interface Props {
        /** The name of the chip: its visible label, or its accessible name when only its icon is drawn. */
        label: string;
        /** A hint on the chip, read on hovering it. */
        hint?: string;
        /** Only the icon (and the badge) is drawn: the line is short of room. */
        compact?: boolean;
        /** Something it governs is on (a disaster armed, a layer shown): the chip is tinted. */
        active?: boolean;
        /** Whether the popover is open. */
        open?: boolean;
        testid: string;
        icon: Snippet;
        /** Drawn after the icon when only the icon is (the size of an armed disaster). */
        badge?: Snippet;
        children: Snippet;
        /**
         * Asked first on Escape, the popover open or not: true when it took the key itself (it disarmed a disaster),
         * the popover then staying as it is. Otherwise Escape closes the popover.
         */
        onEscape?: () => boolean;
        /** Escape is listened to while the popover is closed too (a disaster armed, to disarm it). */
        listenEscape?: boolean;
    }

    let {
        label,
        hint,
        compact = false,
        active = false,
        open = $bindable(false),
        testid,
        icon,
        badge,
        children,
        onEscape,
        listenEscape = false,
    }: Props = $props();

    let root: HTMLDivElement | undefined = $state();
    let trigger: HTMLButtonElement | undefined = $state();
    let popover: HTMLDivElement | undefined = $state();
    let placement: PopoverPlacement | undefined = $state();

    function close(refocus: boolean): void {
        open = false;
        if (refocus) trigger?.focus();
    }

    // One listener for Escape: what the owner does with it first (disarm), else the popover closes, the focus back on
    // its chip. Two listeners would both act on the same key.
    $effect(() => {
        if (!open && !listenEscape) return;
        const onKeydown = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            if (onEscape?.()) return;
            if (open) close(true);
        };
        window.addEventListener("keydown", onKeydown);
        return () => window.removeEventListener("keydown", onKeydown);
    });

    // A press anywhere else closes the popover: on the map too, where it starts aiming the disaster chosen. Listened to
    // on pointerdown, in the capture phase: Phaser prevents the default of the mouse events of its canvas, which a
    // "click outside" helper would take as handled. A slider or a box of the popover left focused would suspend the
    // game inputs (see UserInputManager): it is let go of.
    $effect(() => {
        if (!open) return;
        const onPointerdown = (event: PointerEvent): void => {
            const here = root;
            if (!here || (event.target instanceof Node && here.contains(event.target))) return;
            const focused = document.activeElement;
            if (focused instanceof HTMLElement && here.contains(focused)) focused.blur();
            close(false);
        };
        window.addEventListener("pointerdown", onPointerdown, true);
        return () => window.removeEventListener("pointerdown", onPointerdown, true);
    });

    // Under its chip and the items of the line it would cover, never out of the window: measured when it opens, when
    // its content, the line or the window changes size.
    $effect(() => {
        const box = popover;
        const anchor = root;
        if (!box || !anchor) {
            placement = undefined;
            return;
        }
        // The other items of the clock line: the popover opens under those it would cover.
        const line = anchor.closest('[data-testid="clock-line"]');
        const measure = (): void => {
            const neighbours = Array.from(line?.children ?? [])
                .filter((item) => !item.contains(anchor))
                .map((item) => item.getBoundingClientRect())
                .filter((box) => box.width > 0);
            const next = popoverPlacement(
                anchor.getBoundingClientRect(),
                box.scrollWidth,
                {
                    width: window.innerWidth,
                    height: window.innerHeight,
                },
                neighbours,
            );
            // Written only when it changes: the popover resizing must not measure it again and again.
            if (
                !placement ||
                placement.left !== next.left ||
                placement.top !== next.top ||
                placement.maxWidth !== next.maxWidth ||
                placement.maxHeight !== next.maxHeight
            ) {
                placement = next;
            }
        };
        measure();
        window.addEventListener("resize", measure);
        const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
        observer?.observe(box);
        if (line) observer?.observe(line);
        return () => {
            window.removeEventListener("resize", measure);
            observer?.disconnect();
        };
    });
</script>

<div class="pointer-events-auto relative" bind:this={root}>
    <button
        bind:this={trigger}
        type="button"
        class="flex h-8 items-center gap-1 rounded-full text-xs backdrop-blur {compact ? 'px-2' : 'px-3'} {active
            ? 'bg-contrast ring-2 ring-white'
            : 'bg-contrast/80 hover:bg-contrast'}"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={compact ? label : undefined}
        title={compact ? label : hint}
        data-testid={testid}
        data-active={active ? "true" : "false"}
        onclick={() => (open = !open)}
    >
        {@render icon()}
        {#if !compact}
            <span class="whitespace-nowrap" data-testid="{testid}-label">{label}</span>
        {:else if badge}
            {@render badge()}
        {/if}
    </button>
    {#if open}
        <!-- Its own surface: a press in it never reaches the map (Phaser takes it as "outside" its canvas), and the
             wheel scrolls it without zooming the game (Phaser reads the wheel over its canvas only). -->
        <div
            bind:this={popover}
            role="dialog"
            aria-label={label}
            class="pointer-events-auto absolute z-50 flex w-max flex-col overscroll-contain rounded-xl bg-contrast/95 p-2 text-xs text-white shadow-lg"
            style:left={`${placement?.left ?? 0}px`}
            style:top={`${placement?.top ?? 40}px`}
            style:max-width={placement ? `${placement.maxWidth}px` : undefined}
            style:max-height={placement ? `${placement.maxHeight}px` : undefined}
            data-testid="{testid}-popover"
        >
            {@render children()}
        </div>
    {/if}
</div>
