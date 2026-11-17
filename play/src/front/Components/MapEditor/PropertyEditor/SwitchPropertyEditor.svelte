<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import type { SwitchPropertyData } from "@workadventure/map-editor";
    import { LL } from "../../../../i18n/i18n-svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { mapEditorSwitchWiringStore } from "../../../Stores/MapEditorStore";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";
    import { IconSwitch } from "@wa-icons";

    interface Props {
        entity: Entity;
        property: SwitchPropertyData;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { entity: selected, property = $bindable(), onchange, onclose }: Props = $props();
    // The object as it was when the panel opened (the panel is made anew for another object). Never read again from
    // the props: while the object is deselected the prop is undefined before the panel is taken down, and reading it
    // then broke the whole editor.
    const entity = untrack(() => selected);

    const labels = $derived($LL.mapEditor.properties.switchPropertyData);
    const wiring = $derived($mapEditorSwitchWiringStore === entity.entityId);
    // The objects the switch commands now: read from the map, so that the lamps of its room are counted too.
    const targetCount = $derived(
        gameManager.getCurrentGameScene().getSwitches()?.targetsOf(entity, property).length ?? 0,
    );
    let tags = $state((property.allowedTags ?? []).join(", "));

    function setMode(mode: "zone" | "ids"): void {
        if (property.targets.mode === mode) return;
        property.targets = mode === "zone" ? { mode: "zone" } : { mode: "ids", ids: [] };
        if (mode === "zone") mapEditorSwitchWiringStore.set(undefined);
        onchange?.();
    }

    function toggleWiring(): void {
        mapEditorSwitchWiringStore.set(wiring ? undefined : entity.entityId);
    }

    function saveTags(): void {
        const allowedTags = tags
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag !== "");
        property.allowedTags = allowedTags.length > 0 ? allowedTags : undefined;
        onchange?.();
    }

    onDestroy(() => {
        if (wiring) mapEditorSwitchWiringStore.set(undefined);
    });
</script>

<PropertyEditorBase
    onclose={() => {
        mapEditorSwitchWiringStore.set(undefined);
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconSwitch font-size="18" class="mr-2" />
            {labels.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <span>
            <p class="m-0 mb-3 text-sm text-white/70">{labels.description()}</p>
            <p class="m-0 mb-1 text-sm">{labels.commands()}</p>
            <label class="flex items-center gap-2 text-sm mb-1">
                <input
                    type="radio"
                    name="switch-mode-{property.id}"
                    data-testid="switchModeZone"
                    checked={property.targets.mode === "zone"}
                    onchange={() => setMode("zone")}
                />
                {labels.modeZone()}
            </label>
            <label class="flex items-center gap-2 text-sm mb-3">
                <input
                    type="radio"
                    name="switch-mode-{property.id}"
                    data-testid="switchModeIds"
                    checked={property.targets.mode === "ids"}
                    onchange={() => setMode("ids")}
                />
                {labels.modeIds()}
            </label>
            <p class="m-0 mb-2 text-sm" data-testid="switchTargetCount">
                {labels.targets({ count: targetCount })}
            </p>
            {#if property.targets.mode === "zone" && targetCount === 0}
                <p class="m-0 mb-2 text-sm text-warning" data-testid="switchNoTarget">{labels.noTarget()}</p>
            {/if}
            {#if property.targets.mode === "ids"}
                <button
                    type="button"
                    class="btn btn-sm {wiring ? 'btn-secondary' : 'btn-light btn-ghost'} mb-3"
                    data-testid="switchPickTargets"
                    onclick={toggleWiring}
                >
                    {wiring ? labels.pickDone() : labels.pick()}
                </button>
                {#if wiring}
                    <p class="m-0 mb-3 text-sm text-white/70">{labels.pickHelp()}</p>
                {/if}
            {/if}
            <label class="flex flex-col gap-1 text-sm">
                {labels.allowedTags()}
                <input
                    type="text"
                    class="input-text"
                    data-testid="switchAllowedTags"
                    placeholder={labels.allowedTagsPlaceholder()}
                    bind:value={tags}
                    onchange={saveTags}
                />
            </label>
        </span>
    {/snippet}
</PropertyEditorBase>
