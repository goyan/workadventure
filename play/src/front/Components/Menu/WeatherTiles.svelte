<script lang="ts">
    import type { WeatherType } from "@workadventure/map-editor";
    import WeatherIcon from "./WeatherIcon.svelte";

    interface Option {
        value: WeatherType;
        label: string;
        icon: WeatherType;
    }

    interface Props {
        value: WeatherType;
        options: Option[];
        ariaLabel: string;
        dataTestId?: string;
    }

    let { value = $bindable(), options, ariaLabel, dataTestId }: Props = $props();
</script>

<div role="radiogroup" aria-label={ariaLabel} class="grid grid-cols-3 gap-2" data-testid={dataTestId}>
    {#each options as option (option.value)}
        {@const selected = option.value === value}
        <button
            type="button"
            role="radio"
            aria-checked={selected}
            class="flex flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-3 text-sm font-bold transition-colors {selected
                ? 'border-secondary bg-white/15 text-white'
                : 'border-transparent bg-black/30 text-white/60 hover:bg-white/5 hover:text-white'}"
            onclick={() => (value = option.value)}
        >
            <WeatherIcon icon={option.icon} />
            <span class="truncate">{option.label}</span>
        </button>
    {/each}
</div>
