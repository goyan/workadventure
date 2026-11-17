<script lang="ts">
    import type { FloorLevelStack } from "../../Stores/FloorLevelsStore";
    import { levelChangePulses } from "../../Stores/FloorLevelsStore";

    interface Props {
        /** The floors of the map and the one of the avatar; undefined: nothing to show. */
        stack: FloorLevelStack | undefined;
    }

    let { stack }: Props = $props();

    const reducedMotion =
        typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
    let shownCurrent: number | undefined = undefined;
    let pulse = $state(false);
    let pulseTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
        const current = stack?.current;
        if (current === undefined) return;
        if (levelChangePulses(shownCurrent, current, reducedMotion)) {
            pulse = true;
            clearTimeout(pulseTimer);
            pulseTimer = setTimeout(() => (pulse = false), 600);
        }
        shownCurrent = current;
    });

    $effect(() => () => clearTimeout(pulseTimer));
</script>

{#if stack}
    <div
        class="floor-level-stack rounded-lg bg-contrast/80 px-2 py-1 text-xs leading-5 backdrop-blur"
        class:pulse
        aria-live="polite"
    >
        {#each stack.levels as level (level.elevation)}
            {#if level.elevation === stack.current}
                <div class="font-bold text-white" aria-current="true"><span>▶</span> {level.name}</div>
            {:else}
                <div class="pl-3 text-gray-400">{level.name}</div>
            {/if}
        {/each}
    </div>
{/if}

<style>
    .pulse {
        animation: floor-level-pulse 0.6s ease-out;
    }

    @keyframes floor-level-pulse {
        0% {
            transform: scale(1);
        }
        40% {
            transform: scale(1.08);
        }
        100% {
            transform: scale(1);
        }
    }
</style>
