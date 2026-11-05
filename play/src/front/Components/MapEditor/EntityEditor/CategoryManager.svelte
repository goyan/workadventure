<script lang="ts">
    import type {
        CategorySettings,
        EntityLayer,
        InteractionTrigger,
        ObjectInteraction,
    } from "@workadventure/map-editor";
    import LL from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { executeUpdateWAMSettings } from "../../../Phaser/Game/MapEditor/Commands/Facades";
    import { listMapCategories } from "../../../Utils/ObjectCategories";
    import { categoryLabel } from "../../../Utils/CategoryLabel";

    // The categories of this map: the base ones and those created here. Each one says what players do with its
    // objects (nothing, sit, swim), how it starts (on contact or with the interaction key) and the default display
    // level of its objects. Settings are stored in the map (WAM), for every player.
    interface Props {
        close: () => void;
    }

    let { close }: Props = $props();

    const TC = $derived($LL.mapEditor.categories);
    let categories = $state(readCategories());
    let newCategory = $state("");

    function readCategories() {
        return listMapCategories(gameManager.getCurrentGameScene().wamFile?.settings?.categories);
    }

    // Each change is a command sent to the map: changes wait for the previous one, so quick clicks do not pile up.
    let saving = $state(false);

    function save(id: string, settings: CategorySettings | undefined) {
        saving = true;
        executeUpdateWAMSettings({
            $case: "updateCategorySettingMessage",
            updateCategorySettingMessage: { category: id, settings: settings ? { ...settings } : undefined },
        })
            .then(() => (categories = readCategories()))
            .catch((e) => console.error(e))
            .finally(() => (saving = false));
    }

    function update(id: string, settings: CategorySettings, change: Partial<CategorySettings>) {
        const next = { ...settings, ...change };
        if (next.interaction === "none") next.trigger = "auto";
        categories = categories.map((category) => (category.id === id ? { ...category, settings: next } : category));
        save(id, next);
    }

    function add() {
        const name = newCategory.trim();
        if (
            name === "" ||
            categories.some((category) => category.id.toLocaleLowerCase() === name.toLocaleLowerCase())
        ) {
            return;
        }
        newCategory = "";
        save(name.toLocaleLowerCase(), { interaction: "none", trigger: "auto" });
    }

    const interactions: ObjectInteraction[] = ["none", "sit", "swim"];
    const triggers: InteractionTrigger[] = ["auto", "key"];
    const layers: (EntityLayer | "")[] = ["", "floor", "standing", "overhead"];
</script>

<div class="retro-panel" data-testid="categoryManager" aria-busy={saving}>
    <header class="flex items-start justify-between gap-2 p-4 pb-2">
        <div class="flex flex-col gap-1">
            <span class="retro-heading flex items-center gap-2">
                {TC.manager.title()}
                {#if saving}<span class="retro-spinner" aria-hidden="true"></span>{/if}
            </span>
            <p class="retro-hint">{TC.manager.description()}</p>
        </div>
        <button type="button" class="retro-btn retro-btn-quiet" onclick={close}>{TC.manager.close()}</button>
    </header>

    <div class="flex flex-col gap-2 overflow-y-auto px-4 pb-4 min-h-0">
        {#each categories as category (category.id)}
            <section class="retro-card category-row" data-testid="categoryRow">
                <div class="flex items-center justify-between gap-2">
                    <span class="retro-title">{categoryLabel(category.id)}</span>
                    {#if category.base}
                        <span class="retro-badge">{TC.manager.base()}</span>
                    {:else}
                        <button
                            type="button"
                            class="retro-btn retro-btn-danger"
                            onclick={() => save(category.id, undefined)}>{TC.manager.delete()}</button
                        >
                    {/if}
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <label class="flex flex-col gap-1">
                        <span class="retro-label">{TC.manager.interaction()}</span>
                        <select
                            disabled={saving}
                            value={category.settings.interaction}
                            onchange={(event) =>
                                update(category.id, category.settings, {
                                    interaction: event.currentTarget.value as ObjectInteraction,
                                })}
                        >
                            {#each interactions as interaction (interaction)}
                                <option value={interaction}>{TC.interactions[interaction]()}</option>
                            {/each}
                        </select>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="retro-label">{TC.manager.trigger()}</span>
                        <select
                            value={category.settings.trigger}
                            disabled={saving || category.settings.interaction === "none"}
                            onchange={(event) =>
                                update(category.id, category.settings, {
                                    trigger: event.currentTarget.value as InteractionTrigger,
                                })}
                        >
                            {#each triggers as trigger (trigger)}
                                <option value={trigger}>{TC.triggers[trigger]()}</option>
                            {/each}
                        </select>
                    </label>
                    <label class="flex flex-col gap-1">
                        <span class="retro-label">{TC.manager.layer()}</span>
                        <select
                            disabled={saving}
                            value={category.settings.layer ?? ""}
                            onchange={(event) =>
                                update(category.id, category.settings, {
                                    layer: (event.currentTarget.value || undefined) as EntityLayer | undefined,
                                })}
                        >
                            {#each layers as layer (layer)}
                                <option value={layer}>{TC.layers[layer === "" ? "free" : layer]()}</option>
                            {/each}
                        </select>
                    </label>
                </div>
            </section>
        {/each}

        <form
            class="retro-card"
            onsubmit={(event) => {
                event.preventDefault();
                add();
            }}
        >
            <span class="retro-title">{TC.manager.add()}</span>
            <div class="flex gap-2">
                <input
                    class="grow px-2 py-1.5"
                    placeholder={TC.manager.newName()}
                    bind:value={newCategory}
                    data-testid="newMapCategory"
                />
                <button type="submit" class="retro-btn retro-btn-primary" disabled={newCategory.trim() === ""}>
                    {TC.manager.addButton()}
                </button>
            </div>
        </form>
    </div>
</div>

<style>
    .category-row select {
        width: 100%;
        padding: 0.35rem 0.5rem;
        font-size: 0.8125rem;
    }
</style>
