<script lang="ts">
    import type { GobeurLevel, GobeurPropertyData } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import type { GobeurLaunchResult } from "../../../Phaser/Game/Gobeur/GobeurManager";
    import { gobeurGamesStore } from "../../../Stores/GobeurStore";
    import Input from "../../Input/Input.svelte";
    import { IconClock } from "../../Icons";
    import {
        formatGobeurRemaining,
        gobeurPlayerName,
        presentGobeurPlayers,
        uniqueGobeurPlayers,
    } from "../../Gobeur/GobeurPlayers";
    import type { GobeurPlayer } from "../../Gobeur/GobeurPlayers";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";

    // "unavailable": the scene has no Gobeur manager (yet).
    type GobeurLaunchFailure = Extract<GobeurLaunchResult, { ok: false }>["reason"] | "unavailable";

    interface Props {
        property: GobeurPropertyData;
        entityId: string;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { property = $bindable(), entityId, onchange, onclose }: Props = $props();

    const scene = gameManager.getCurrentGameScene();
    const mapPlayers = scene.MapPlayersByKey;
    const levels: GobeurLevel[] = ["beginner", "intermediate", "hard"];

    // Read once: the areas are edited in another tool, the panel is rebuilt when the entity is selected again.
    const areas = [...(scene.getGameMap().getWamFile()?.getGameMapAreas()?.getAreas().values() ?? [])]
        .map((area) => ({ id: area.id, name: area.name || area.id }))
        .sort((a, b) => a.name.localeCompare(b.name));

    let durationMinutes = $state(property.durationSeconds / 60);
    let launchFailure: GobeurLaunchFailure | undefined = $state(undefined);
    let now = $state(Date.now());
    const clock = setInterval(() => {
        now = Date.now();
    }, 1000);
    onDestroy(() => clearInterval(clock));

    // Recomputed when a remote player comes or goes.
    let present: GobeurPlayer[] = $derived(presentGobeurPlayers($mapPlayers.values()));
    let players = $derived(uniqueGobeurPlayers(property.players));
    let absent = $derived(players.filter((chosen) => !present.some((player) => player.uuid === chosen.uuid)));
    let game = $derived($gobeurGamesStore.get(entityId));
    let running = $derived(game?.running === true);
    let blockingReason: GobeurLaunchFailure | undefined = $derived.by(() => {
        if (running) return "alreadyRunning";
        if (property.prisonAreaId === "" || !areas.some((area) => area.id === property.prisonAreaId)) {
            return "noPrison";
        }
        if (!players.some((chosen) => present.some((player) => player.uuid === chosen.uuid))) {
            return "noPlayer";
        }
        return undefined;
    });
    let shownReason = $derived(blockingReason ?? launchFailure);
    let knownPlayers = $derived([...present, ...players]);

    function onValueChange() {
        launchFailure = undefined;
        onchange?.();
    }

    // Replaced, not mutated: the parent binds it, and a plain object given without binding stays reactive.
    function update(changes: Partial<Omit<GobeurPropertyData, "id" | "type">>) {
        const next = { ...property, ...changes };
        // No fallback: no key at all, rather than a key holding undefined.
        if (next.fallbackSafeAreaId === undefined) {
            delete next.fallbackSafeAreaId;
        }
        property = next;
        onValueChange();
    }

    function isChosen(uuid: string): boolean {
        return players.some((player) => player.uuid === uuid);
    }

    function togglePlayer(player: GobeurPlayer) {
        update({
            players: isChosen(player.uuid)
                ? players.filter((chosen) => chosen.uuid !== player.uuid)
                : [...players, { uuid: player.uuid, name: player.name }],
        });
    }

    function onPrisonChange(event: Event) {
        if (event.target instanceof HTMLSelectElement) {
            update({ prisonAreaId: event.target.value });
        }
    }

    function onFallbackChange(event: Event) {
        if (event.target instanceof HTMLSelectElement) {
            update({ fallbackSafeAreaId: event.target.value === "" ? undefined : event.target.value });
        }
    }

    function setLevel(level: GobeurLevel) {
        update({ level });
    }

    function onDurationChange() {
        const minutes = Number(durationMinutes);
        const seconds = Number.isFinite(minutes) ? Math.round(minutes * 60) : 180;
        const durationSeconds = Math.min(3600, Math.max(30, seconds));
        durationMinutes = durationSeconds / 60;
        update({ durationSeconds });
    }

    function launch() {
        const manager = scene.gobeurManager;
        if (!manager) {
            launchFailure = "unavailable";
            return;
        }
        manager
            .launch(entityId)
            .then((result) => {
                launchFailure = result.ok ? undefined : result.reason;
            })
            .catch((error) => console.error("Unable to launch the Gobeur", error));
    }

    function stop() {
        scene.gobeurManager?.stop(entityId);
    }
</script>

<PropertyEditorBase
    onclose={() => {
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconClock font-size="18" class="mr-2" />
            {$LL.mapEditor.properties.gobeur.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <div class="flex flex-col gap-3">
            <div>
                <p class="m-0 mb-1 font-bold">{$LL.mapEditor.properties.gobeur.players()}</p>
                {#if present.length === 0}
                    <p class="m-0 text-sm opacity-50">{$LL.mapEditor.properties.gobeur.noPlayerPresent()}</p>
                {/if}
                {#each present as player (player.uuid)}
                    <label class="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            data-testid="gobeurPlayer-{player.uuid}"
                            checked={isChosen(player.uuid)}
                            disabled={running}
                            onchange={() => togglePlayer(player)}
                        />
                        {player.name || player.uuid.slice(0, 8)}
                    </label>
                {/each}
                {#each absent as player (player.uuid)}
                    <label
                        class="flex items-center gap-2 text-sm opacity-50"
                        data-testid="gobeurAbsentPlayer-{player.uuid}"
                    >
                        <input type="checkbox" checked disabled={running} onchange={() => togglePlayer(player)} />
                        {player.name || player.uuid.slice(0, 8)}
                    </label>
                {/each}
            </div>

            <div class="flex flex-col">
                <label for="gobeurPrison-{property.id}" class="input-label font-light">
                    {$LL.mapEditor.properties.gobeur.prison()}
                </label>
                <select
                    id="gobeurPrison-{property.id}"
                    class="input-select font-light text-white"
                    data-testid="gobeurPrison"
                    value={property.prisonAreaId}
                    disabled={running}
                    onchange={onPrisonChange}
                >
                    <option value="">{$LL.mapEditor.properties.gobeur.none()}</option>
                    {#each areas as area (area.id)}
                        <option value={area.id}>{area.name}</option>
                    {/each}
                </select>
            </div>

            <div class="flex flex-col">
                <label for="gobeurFallback-{property.id}" class="input-label font-light">
                    {$LL.mapEditor.properties.gobeur.fallbackSafe()}
                </label>
                <select
                    id="gobeurFallback-{property.id}"
                    class="input-select font-light text-white"
                    data-testid="gobeurFallbackSafe"
                    value={property.fallbackSafeAreaId ?? ""}
                    disabled={running}
                    onchange={onFallbackChange}
                >
                    <option value="">{$LL.mapEditor.properties.gobeur.none()}</option>
                    {#each areas as area (area.id)}
                        <option value={area.id}>{area.name}</option>
                    {/each}
                </select>
            </div>

            <div>
                <p class="m-0 mb-1 font-light">{$LL.mapEditor.properties.gobeur.level()}</p>
                <div class="flex flex-row gap-1">
                    {#each levels as level (level)}
                        <button
                            type="button"
                            class="flex-1 rounded px-2 py-1 text-sm {property.level === level
                                ? 'bg-secondary'
                                : 'bg-white/10 hover:bg-white/20'}"
                            data-testid="gobeurLevel-{level}"
                            disabled={running}
                            onclick={() => setLevel(level)}
                        >
                            {$LL.mapEditor.properties.gobeur[level]()}
                        </button>
                    {/each}
                </div>
            </div>

            <Input
                id="gobeurDuration-{property.id}"
                type="number"
                label={$LL.mapEditor.properties.gobeur.duration()}
                min={0.5}
                max={60}
                step={0.5}
                disabled={running}
                bind:value={durationMinutes}
                onchange={onDurationChange}
            />

            {#if running && game}
                <div class="flex flex-col gap-1 text-sm" data-testid="gobeurRunning">
                    <span>
                        {$LL.mapEditor.properties.gobeur.remaining({ time: formatGobeurRemaining(game.endsAt - now) })}
                    </span>
                    <span>{$LL.mapEditor.properties.gobeur.survivors({ count: game.survivors.length })}</span>
                    <span class="opacity-70">
                        {game.survivors.map((uuid) => gobeurPlayerName(uuid, knownPlayers)).join(", ")}
                    </span>
                    <span>{$LL.mapEditor.properties.gobeur.caught({ count: game.caught.length })}</span>
                    <span class="opacity-70">
                        {game.caught.map((uuid) => gobeurPlayerName(uuid, knownPlayers)).join(", ")}
                    </span>
                    {#if game.isMaster}
                        <button
                            type="button"
                            class="rounded bg-danger px-3 py-2"
                            data-testid="gobeurStop"
                            onclick={stop}
                        >
                            {$LL.mapEditor.properties.gobeur.stop()}
                        </button>
                    {/if}
                </div>
            {:else}
                <button
                    type="button"
                    class="rounded bg-secondary px-3 py-2 disabled:opacity-50"
                    data-testid="gobeurLaunch"
                    disabled={blockingReason !== undefined}
                    onclick={launch}
                >
                    {$LL.mapEditor.properties.gobeur.launch()}
                </button>
            {/if}
            {#if shownReason && !running}
                <p class="m-0 text-xs text-red-500" data-testid="gobeurLaunchReason">
                    {$LL.mapEditor.properties.gobeur.errors[shownReason]()}
                </p>
            {/if}
        </div>
    {/snippet}
</PropertyEditorBase>
