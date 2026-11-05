<script lang="ts">
    import type { Snippet } from "svelte";
    interface Props {
        id?: string | undefined;
        dataTestId?: string;
        label: string;
        onchange?: () => void;
        disabled?: boolean;
        value: unknown;
        group: unknown;
        outerClass?: string;
        children?: Snippet;
    }

    let {
        id = undefined,
        dataTestId = undefined,
        label,
        onchange = () => {},
        disabled = false,
        value,
        group = $bindable(),
        outerClass = undefined,
        children,
    }: Props = $props();

    let uniqueId = (() => id || `input-${Math.random().toString(36).substring(2, 9)} `)();
</script>

<div class={outerClass}>
    <input id={uniqueId} class="hidden peer radio-ds" type="radio" bind:group {value} {onchange} {disabled} />
    <label
        for={uniqueId}
        data-testid={dataTestId}
        class="relative inline-flex items-start w-full h-full p-4 ps-12 text-start text-white bg-white/[0.03] border border-solid border-white/15 rounded-lg cursor-pointer transition-colors hover:border-white/30 hover:bg-white/5 peer-checked:border-secondary peer-checked:bg-secondary/10 min-w-[170px]"
    >
        <div class="flex flex-col gap-1">
            <div class="w-full text-sm font-bold">{label}</div>
            <div class="text-sm font-normal text-white/60">
                {@render children?.()}
            </div>
        </div>
    </label>
</div>

<style>
    input[type="radio"].peer.radio-ds + label::before {
        content: "";
        position: absolute;
        inset-inline-start: 1rem;
        top: 1.05rem;
        width: 24px;
        height: 24px;
        background: currentColor;
        mask-image: url("./images/icon-radio.svg");
        mask-size: contain;
        mask-repeat: no-repeat;
    }
    input[type="radio"].peer.radio-ds:checked + label::before {
        mask-image: url("./images/icon-radio-checked.svg");
    }
</style>
