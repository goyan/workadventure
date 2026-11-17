<script lang="ts">
    import { LL } from "../../../i18n/i18n-svelte";
    import { skyShadowCategoryStores } from "../../Stores/SkyLightStore";
    import InputSwitch from "../Input/InputSwitch.svelte";

    const { walls, objects, trees, details, avatars, animals } = skyShadowCategoryStores;
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
        <InputSwitch
            id="sky-shadow-details"
            bind:value={$details}
            label={$LL.menu.settings.skyLight.casters.details()}
            labelPosition="right"
        />
        <InputSwitch
            id="sky-shadow-avatars"
            bind:value={$avatars}
            label={$LL.menu.settings.skyLight.casters.avatars()}
            labelPosition="right"
        />
        <InputSwitch
            id="sky-shadow-animals"
            bind:value={$animals}
            label={$LL.menu.settings.skyLight.casters.animals()}
            labelPosition="right"
        />
    </div>
</details>
