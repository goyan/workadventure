<script lang="ts">
    import { onMount } from "svelte";

    // The name of the build slot under the pointer or the keyboard focus, in the map editor panel: its `data-tip`, or
    // else its label. One tooltip for every slot, fixed to the screen, so that no scrolling panel cuts it.
    let tip: { text: string; x: number; y: number; below: boolean } | undefined = $state(undefined);

    function slotOf(target: EventTarget | null): HTMLElement | undefined {
        if (!(target instanceof Element)) return undefined;
        return target.closest<HTMLElement>(".map-editor .build-slot") ?? undefined;
    }

    function show(slot: HTMLElement | undefined): void {
        const text = slot?.dataset.tip ?? slot?.getAttribute("aria-label");
        if (!slot || !text) {
            tip = undefined;
            return;
        }
        const rect = slot.getBoundingClientRect();
        // Above the slot, or under it when the slot is near the top of the screen.
        const below = rect.top < 48;
        tip = { text, x: rect.left + rect.width / 2, y: below ? rect.bottom : rect.top, below };
    }

    onMount(() => {
        const over = (event: Event) => show(slotOf(event.target));
        const hide = () => (tip = undefined);
        document.addEventListener("pointerover", over);
        document.addEventListener("focusin", over);
        document.addEventListener("focusout", hide);
        document.addEventListener("pointerdown", hide);
        document.addEventListener("scroll", hide, true);
        return () => {
            document.removeEventListener("pointerover", over);
            document.removeEventListener("focusin", over);
            document.removeEventListener("focusout", hide);
            document.removeEventListener("pointerdown", hide);
            document.removeEventListener("scroll", hide, true);
        };
    });
</script>

{#if tip}
    <div class="build-tip" class:below={tip.below} style:left="{tip.x}px" style:top="{tip.y}px" role="tooltip">
        {tip.text}
    </div>
{/if}
