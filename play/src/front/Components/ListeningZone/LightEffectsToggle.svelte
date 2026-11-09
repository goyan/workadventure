<script lang="ts">
    import TooltipAbove from "./TooltipAbove.svelte";

    let {
        on,
        label,
        onclick,
        testid,
        disabled = false,
    }: { on: boolean; label: string; onclick?: () => void; testid: string; disabled?: boolean } = $props();
</script>

<TooltipAbove {label}>
    <button
        type="button"
        class="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 transition {on
            ? 'disco-on bg-fuchsia-500/20 text-fuchsia-200'
            : 'bg-white/10 text-white/50'} hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-40"
        aria-pressed={on}
        {disabled}
        aria-label={label}
        {onclick}
        data-testid={testid}
    >
        <svg class="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 1v4" class="stroke-current" stroke-width="1.5" />
            <circle cx="12" cy="13" r="7.5" class="fill-current opacity-25" />
            <circle cx="12" cy="13" r="7.5" class="fill-none stroke-current" stroke-width="1.3" />
            <path
                d="M4.6 11h14.8M4.6 15h14.8M12 5.5c-2.6 2.3-2.6 12.7 0 15M12 5.5c2.6 2.3 2.6 12.7 0 15M7.5 7c-1.7 3-1.7 9 0 12M16.5 7c1.7 3 1.7 9 0 12"
                class="fill-none stroke-current"
                stroke-width="0.9"
            />
            <circle cx="9.3" cy="10.2" r="1.3" class="fill-white" />
            {#if !on}<path d="M3 3l18 18" class="stroke-current" stroke-width="2" stroke-linecap="round" />{/if}
        </svg>
    </button>
</TooltipAbove>

<style>
    .disco-on {
        box-shadow:
            0 0 10px rgb(217 70 239 / 0.6),
            0 0 18px rgb(56 189 248 / 0.35);
        animation: disco-glow 2.4s linear infinite;
    }
    @keyframes disco-glow {
        0% {
            filter: hue-rotate(0deg);
        }
        100% {
            filter: hue-rotate(360deg);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .disco-on {
            animation: none;
        }
    }
</style>
