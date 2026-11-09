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
            ? 'disco-on bg-fuchsia-500/25 text-white'
            : 'bg-white/10 text-white/50'} hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default disabled:opacity-40"
        aria-pressed={on}
        {disabled}
        aria-label={label}
        {onclick}
        data-testid={testid}
    >
        <svg class="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
            <defs>
                <radialGradient id="disco-silver" cx="35%" cy="30%" r="75%">
                    <stop offset="0" stop-color="#ffffff" />
                    <stop offset="0.45" stop-color="#c9d3e6" />
                    <stop offset="1" stop-color="#4b5470" />
                </radialGradient>
                <clipPath id="disco-clip"><circle cx="12" cy="13.5" r="8" /></clipPath>
            </defs>
            <path d="M12 0.5v5" stroke="currentColor" stroke-width="1.4" />
            <g class={on ? "" : "grayscale"}>
                <circle cx="12" cy="13.5" r="8" fill="url(#disco-silver)" />
                <g clip-path="url(#disco-clip)">
                    <!-- A few facets catching the room's coloured lights. -->
                    <rect x="12.6" y="6" width="3.6" height="3.4" fill="#ff4fd8" opacity="0.85" />
                    <rect x="6" y="13.9" width="3.4" height="3.4" fill="#3ee6ff" opacity="0.8" />
                    <rect x="12.6" y="17.6" width="3.6" height="3.4" fill="#a77bff" opacity="0.85" />
                    <rect x="16.4" y="10" width="3.4" height="3.6" fill="#ffd166" opacity="0.7" />
                    <path
                        d="M3 9.8h18M3 13.8h18M3 17.6h18M12 4c-2.8 3-2.8 16 0 19M12 4c2.8 3 2.8 16 0 19M7.6 5.6c-2 4-2 12 0 16M16.4 5.6c2 4 2 12 0 16"
                        fill="none"
                        stroke="#1e2235"
                        stroke-opacity="0.55"
                        stroke-width="0.7"
                    />
                </g>
                <circle cx="12" cy="13.5" r="8" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="0.6" />
                <path d="M8.8 8.6l0.9 2 2 0.9-2 0.9-0.9 2-0.9-2-2-0.9 2-0.9z" fill="#ffffff" />
            </g>
            {#if !on}<path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />{/if}
        </svg>
    </button>
</TooltipAbove>

<style>
    .disco-on {
        box-shadow:
            0 0 10px rgb(217 70 239 / 0.7),
            0 0 22px rgb(56 189 248 / 0.45);
        animation: disco-glow 2.4s linear infinite;
    }
    .disco-on svg {
        filter: drop-shadow(0 0 3px rgb(255 255 255 / 0.6));
    }
    .grayscale {
        filter: grayscale(1) brightness(0.7);
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
