<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { skyShadowCategoryStores, skyShadowShapeStores, skyShadowTreeSwayStore } from "../../Stores/SkyLightStore";
    import InputSwitch from "../Input/InputSwitch.svelte";
    import SegmentedControl from "./SegmentedControl.svelte";

    const { walls, objects, trees, details, avatars, animals } = skyShadowCategoryStores;
    const { trees: treeShape, avatars: avatarShape, animals: animalShape, details: detailShape } = skyShadowShapeStores;
    const shapes = $derived([
        { value: "oval" as const, label: $LL.menu.settings.skyLight.casters.shape.oval() },
        { value: "realistic" as const, label: $LL.menu.settings.skyLight.casters.shape.realistic() },
    ]);
</script>

<details class="rounded-xl border border-white/10 bg-black/10 text-sm" data-testid="sky-shadow-categories">
    <summary
        class="cursor-pointer rounded-xl px-3 py-2 text-white/80 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
        {$LL.menu.settings.skyLight.casters.title()}
    </summary>
    <div class="flex flex-col gap-2 px-3 pb-3">
        <InputSwitch
            id="sky-shadow-walls"
            bind:value={$walls}
            label={$LL.menu.settings.skyLight.casters.walls()}
            labelPosition="right"
        />
        <InputSwitch
            id="sky-shadow-objects"
            bind:value={$objects}
            label={$LL.menu.settings.skyLight.casters.objects()}
            labelPosition="right"
        />
        <InputSwitch
            id="sky-shadow-trees"
            bind:value={$trees}
            label={$LL.menu.settings.skyLight.casters.trees()}
            labelPosition="right"
        />
        {#if $trees}
            <div class="ps-4">
                <SegmentedControl
                    ariaLabel="{$LL.menu.settings.skyLight.casters.trees()} : {$LL.menu.settings.skyLight.casters.shape.label()}"
                    bind:value={$treeShape}
                    dataTestId="sky-shadow-trees-shape"
                    options={shapes}
                />
            </div>
            <div class="ps-4">
                <InputSwitch
                    id="sky-shadow-tree-sway"
                    bind:value={$skyShadowTreeSwayStore}
                    label={$LL.menu.settings.skyLight.casters.treeSway()}
                    labelPosition="right"
                />
            </div>
        {/if}
        <InputSwitch
            id="sky-shadow-details"
            bind:value={$details}
            label={$LL.menu.settings.skyLight.casters.details()}
            labelPosition="right"
        />
        {#if $details}
            <div class="ps-4">
                <SegmentedControl
                    ariaLabel="{$LL.menu.settings.skyLight.casters.details()} : {$LL.menu.settings.skyLight.casters.shape.label()}"
                    bind:value={$detailShape}
                    dataTestId="sky-shadow-details-shape"
                    options={shapes}
                />
            </div>
        {/if}
        <InputSwitch
            id="sky-shadow-avatars"
            bind:value={$avatars}
            label={$LL.menu.settings.skyLight.casters.avatars()}
            labelPosition="right"
        />
        {#if $avatars}
            <div class="ps-4">
                <SegmentedControl
                    ariaLabel="{$LL.menu.settings.skyLight.casters.avatars()} : {$LL.menu.settings.skyLight.casters.shape.label()}"
                    bind:value={$avatarShape}
                    dataTestId="sky-shadow-avatars-shape"
                    options={shapes}
                />
            </div>
        {/if}
        <InputSwitch
            id="sky-shadow-animals"
            bind:value={$animals}
            label={$LL.menu.settings.skyLight.casters.animals()}
            labelPosition="right"
        />
        {#if $animals}
            <div class="ps-4">
                <SegmentedControl
                    ariaLabel="{$LL.menu.settings.skyLight.casters.animals()} : {$LL.menu.settings.skyLight.casters.shape.label()}"
                    bind:value={$animalShape}
                    dataTestId="sky-shadow-animals-shape"
                    options={shapes}
                />
            </div>
        {/if}
    </div>
</details>
