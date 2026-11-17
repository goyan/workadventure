<script lang="ts">
    import { onDestroy, untrack } from "svelte";
    import {
        RGB_LAMP_MAX_ANGLE,
        RGB_LAMP_MIN_ANGLE,
        SWITCH_OFF_DELAY_MAX_S,
        SWITCH_PROXIMITY_MAX_TILES,
        type SwitchPropertyData,
    } from "@workadventure/map-editor";
    import {
        hoursTrigger,
        proximityPresenceTrigger,
        roomPresenceTrigger,
    } from "../../../Phaser/Game/Switches/SwitchWiring";
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

    const scene = gameManager.getCurrentGameScene();
    const triggerType = $derived(property.trigger?.type ?? "manual");
    // The named areas of the floor of the switch, for a sensor that watches a chosen area.
    const areas = $derived(
        [...(scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [])]
            .filter((area) => (area.elevation ?? 0) === entity.getElevation() && area.name.trim() !== "")
            .map((area) => ({ id: area.id, name: area.name })),
    );
    const hasRoom = $derived(scene.getSwitches()?.roomAreaIdOf(entity) !== undefined);

    function setTriggerType(type: string): void {
        if (type === triggerType) return;
        if (type === "presence") {
            // Out of any room, a sensor starts on what is around it.
            property.trigger = hasRoom ? roomPresenceTrigger() : proximityPresenceTrigger();
        } else if (type === "hours") {
            property.trigger = hoursTrigger();
        } else {
            property.trigger = undefined;
            property.resolvedTargets = undefined;
        }
        onchange?.();
    }

    const hasBuilding = $derived(scene.getSwitches()?.buildingBoundsOf(entity) !== undefined);

    function setScope(scope: "room" | "area" | "proximity" | "cone" | "building"): void {
        if (property.trigger?.type !== "presence") return;
        property.trigger.scope = scope;
        property.trigger.areaId = scope === "area" ? areas[0]?.id : undefined;
        onchange?.();
    }

    /** Keeps a number typed in a field within its bounds. */
    function bounded(value: number, min: number, max: number, fallback: number): number {
        return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
    }

    function setMode(mode: "zone" | "ids"): void {
        if (property.targets.mode === mode) return;
        property.targets = mode === "zone" ? { mode: "zone" } : { mode: "ids", ids: [] };
        if (mode === "zone") mapEditorSwitchWiringStore.set(undefined);
        onchange?.();
    }

    /**
     * "Link lamps": from then on a click on any lamp of the map, wherever it is, adds it to what the switch commands
     * or removes it. A switch that commanded its room keeps the lamps of the room as a start.
     */
    function toggleWiring(): void {
        if (wiring) {
            mapEditorSwitchWiringStore.set(undefined);
            return;
        }
        if (property.targets.mode !== "ids") {
            const ids = (scene.getSwitches()?.targetsOf(entity, property) ?? []).map((target) => target.id);
            property.targets = { mode: "ids", ids };
            property.resolvedTargets = undefined;
            onchange?.();
        }
        mapEditorSwitchWiringStore.set(entity.entityId);
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
            <label class="flex flex-col gap-1 text-sm mb-3">
                {labels.trigger()}
                <select
                    class="input-text"
                    data-testid="switchTrigger"
                    value={triggerType}
                    onchange={(event) => setTriggerType(event.currentTarget.value)}
                >
                    <option value="manual">{labels.triggerManual()}</option>
                    <option value="presence">{labels.triggerPresence()}</option>
                    <option value="hours">{labels.triggerHours()}</option>
                </select>
            </label>
            {#if property.trigger?.type === "presence"}
                {@const trigger = property.trigger}
                <div class="mb-3 flex flex-col gap-1 text-sm">
                    {#each ["room", "area", "building", "proximity", "cone"] as const as scope (scope)}
                        <label class="flex items-center gap-2">
                            <input
                                type="radio"
                                name="switch-scope-{property.id}"
                                data-testid="switchScope-{scope}"
                                checked={trigger.scope === scope}
                                disabled={scope === "area" && areas.length === 0}
                                onchange={() => setScope(scope)}
                            />
                            {labels.scope[scope]()}
                        </label>
                    {/each}
                    {#if trigger.scope === "room" && !hasRoom}
                        <p class="m-0 text-warning" data-testid="switchNoRoom">{labels.noRoom()}</p>
                    {/if}
                    {#if trigger.scope === "building" && !hasBuilding}
                        <p class="m-0 text-warning" data-testid="switchNoBuilding">{labels.noBuilding()}</p>
                    {/if}
                    {#if trigger.scope === "area"}
                        <select
                            class="input-text"
                            data-testid="switchArea"
                            value={trigger.areaId}
                            onchange={(event) => {
                                trigger.areaId = event.currentTarget.value;
                                onchange?.();
                            }}
                        >
                            {#each areas as area (area.id)}
                                <option value={area.id}>{area.name}</option>
                            {/each}
                        </select>
                    {/if}
                    {#if trigger.scope === "proximity" || trigger.scope === "cone"}
                        <label class="flex items-center gap-2">
                            {labels.tiles()}
                            <input
                                type="number"
                                class="input-text w-20"
                                data-testid="switchTiles"
                                min="1"
                                max={SWITCH_PROXIMITY_MAX_TILES}
                                value={trigger.tiles}
                                onchange={(event) => {
                                    trigger.tiles = bounded(
                                        event.currentTarget.valueAsNumber,
                                        1,
                                        SWITCH_PROXIMITY_MAX_TILES,
                                        trigger.tiles,
                                    );
                                    onchange?.();
                                }}
                            />
                        </label>
                    {/if}
                    {#if trigger.scope === "cone"}
                        <label class="flex items-center gap-2">
                            {labels.direction()}
                            <input
                                type="number"
                                class="input-text w-20"
                                data-testid="switchDirection"
                                min="0"
                                max="359"
                                value={trigger.direction}
                                onchange={(event) => {
                                    trigger.direction = bounded(
                                        event.currentTarget.valueAsNumber,
                                        0,
                                        359,
                                        trigger.direction,
                                    );
                                    onchange?.();
                                }}
                            />
                        </label>
                        <label class="flex items-center gap-2">
                            {labels.angle()}
                            <input
                                type="number"
                                class="input-text w-20"
                                data-testid="switchAngle"
                                min={RGB_LAMP_MIN_ANGLE}
                                max={RGB_LAMP_MAX_ANGLE}
                                value={trigger.angle}
                                onchange={(event) => {
                                    trigger.angle = bounded(
                                        event.currentTarget.valueAsNumber,
                                        RGB_LAMP_MIN_ANGLE,
                                        RGB_LAMP_MAX_ANGLE,
                                        trigger.angle,
                                    );
                                    onchange?.();
                                }}
                            />
                        </label>
                    {/if}
                    <label class="flex items-center gap-2">
                        {labels.offDelay()}
                        <input
                            type="number"
                            class="input-text w-20"
                            data-testid="switchOffDelay"
                            min="0"
                            max={SWITCH_OFF_DELAY_MAX_S}
                            value={trigger.offDelay}
                            onchange={(event) => {
                                trigger.offDelay = bounded(
                                    event.currentTarget.valueAsNumber,
                                    0,
                                    SWITCH_OFF_DELAY_MAX_S,
                                    trigger.offDelay,
                                );
                                onchange?.();
                            }}
                        />
                    </label>
                </div>
            {/if}
            {#if property.trigger?.type === "hours"}
                {@const trigger = property.trigger}
                <div class="mb-3 flex items-center gap-2 text-sm">
                    {labels.hoursFrom()}
                    <input
                        type="time"
                        class="input-text"
                        data-testid="switchHoursFrom"
                        value={trigger.from}
                        onchange={(event) => {
                            if (event.currentTarget.value) {
                                trigger.from = event.currentTarget.value.slice(0, 5);
                                onchange?.();
                            }
                        }}
                    />
                    {labels.hoursTo()}
                    <input
                        type="time"
                        class="input-text"
                        data-testid="switchHoursTo"
                        value={trigger.to}
                        onchange={(event) => {
                            if (event.currentTarget.value) {
                                trigger.to = event.currentTarget.value.slice(0, 5);
                                onchange?.();
                            }
                        }}
                    />
                </div>
                <p class="m-0 mb-3 text-sm text-white/70">{labels.hoursParis()}</p>
            {/if}
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
            <button
                type="button"
                class="btn btn-sm {wiring ? 'btn-secondary' : 'btn-light'} mb-3"
                data-testid="switchPickTargets"
                onclick={toggleWiring}
            >
                {wiring ? labels.pickDone() : labels.pick()}
            </button>
            {#if wiring}
                <p class="m-0 mb-3 text-sm text-white/70">{labels.pickHelp()}</p>
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
