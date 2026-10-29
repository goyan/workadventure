<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { SvelteMap, SvelteSet } from "svelte/reactivity";
    import type { ExitPropertyData } from "@workadventure/map-editor";
    import { WAMFileFormat } from "@workadventure/map-editor";
    import { wamFileMigration } from "@workadventure/map-editor/src/Migrations/WamFileMigration";
    import axios from "axios";
    import { z } from "zod";
    import { LL } from "../../../../i18n/i18n-svelte";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { ABSOLUTE_PUSHER_URL } from "../../../Enum/ComputedConst";
    import Input from "../../Input/Input.svelte";
    import Select from "../../Input/Select.svelte";
    import { IconDoorOut } from "../../Icons";
    import PropertyEditorBase from "./PropertyEditorBase.svelte";

    interface Props {
        property: ExitPropertyData;
        onchange?: () => void;
        onclose?: () => void;
    }

    let { property = $bindable(), onchange, onclose }: Props = $props();

    // Key: room URL
    let mapsUrl = $state(
        new Map<
            string,
            {
                name: string;
                wamUrl: string | undefined;
            }
        >(),
    );
    // Several maps can share one name (copies, maps created from the same template): the folder tells them apart.
    let duplicatedNames = $derived.by(() => {
        const seen = new SvelteSet<string>();
        const duplicated = new SvelteSet<string>();
        for (const map of mapsUrl.values()) {
            if (seen.has(map.name)) {
                duplicated.add(map.name);
            }
            seen.add(map.name);
        }
        return duplicated;
    });

    function mapLabel(roomUrl: string, name: string): string {
        if (!duplicatedNames.has(name)) {
            return name;
        }
        return `${name} (${roomUrl.replace(/^\/~\//, "").replace(/\/office\.wam$/, "")})`;
    }

    let startAreas: string[] = $state([]);
    function onValueChange() {
        onchange?.();
    }

    const connection = gameManager.getCurrentGameScene().connection;

    async function fetchMaps(): Promise<void> {
        const response = await gameManager.getCurrentGameScene().connection?.queryRoomsFromSameWorld();

        if (response) {
            const nextMapsUrl = new SvelteMap(mapsUrl);
            for (const room of response) {
                //const url = new URL(room.url);
                nextMapsUrl.set(room.roomUrl, {
                    name: room.name,
                    wamUrl: room.wamUrl,
                });
            }
            mapsUrl = nextMapsUrl;
        }
    }

    async function fetchStartAreasName(): Promise<void> {
        if (property.url == undefined || property.url == "") {
            // Find the first map in the mapsUrl map
            const firstMap = mapsUrl.entries().next().value;
            if (firstMap) {
                property.url = firstMap[0];
                onValueChange();
            }
        }

        if (connection) {
            const wamUrl = mapsUrl.get(property.url)?.wamUrl;

            if (!wamUrl) {
                return;
            }

            const response = await axios.get(wamUrl);
            const result = WAMFileFormat.safeParse(wamFileMigration.migrate(response.data));
            if (result.success && result.data && result.data.areas) {
                startAreas = result.data.areas
                    .filter((area) => area.properties.find((property) => property.type === "start"))
                    .map((area) => area.name);
            }
        }
    }

    // Map creation: the button only exists when the server says the user may create maps (it recomputes the right itself).
    // Requests are cancelled when the panel closes: a late answer must not touch a destroyed component.
    const abortController = new AbortController();
    onDestroy(() => abortController.abort());

    let canCreateMap = $state(false);
    let newMapName: string | number | null = $state("");
    let isCreatingMap = $state(false);
    let createMapError = $state("");

    async function fetchCanCreateMap(): Promise<void> {
        const roomUrl = encodeURIComponent(gameManager.currentStartedRoom.href);
        const response = await fetch(`${ABSOLUTE_PUSHER_URL}map-creation?roomUrl=${roomUrl}`, {
            headers: { Authorization: localUserStore.getAuthToken() || "" },
            signal: abortController.signal,
        });
        if (!response.ok) {
            return;
        }
        canCreateMap = z.object({ allowed: z.boolean() }).parse(await response.json()).allowed;
    }

    function setCreatingMap(value: boolean): void {
        isCreatingMap = value;
    }

    // Synchronous on purpose: the state is written after the request, not from the stale values read before it.
    function applyCreatedMap(roomUrl: string, name: string): void {
        const nextMapsUrl = new SvelteMap(mapsUrl);
        nextMapsUrl.set(roomUrl, { name, wamUrl: undefined });
        mapsUrl = nextMapsUrl;
        property.url = roomUrl;
        property.areaName = "";
        newMapName = "";
        onValueChange();
    }

    async function createMap(): Promise<void> {
        const name = String(newMapName ?? "").trim();
        if (isCreatingMap || name.length === 0) {
            return;
        }
        setCreatingMap(true);
        createMapError = "";
        try {
            const response = await fetch(`${ABSOLUTE_PUSHER_URL}map-creation`, {
                method: "POST",
                headers: { Authorization: localUserStore.getAuthToken() || "", "Content-Type": "application/json" },
                signal: abortController.signal,
                body: JSON.stringify({ name, roomUrl: gameManager.currentStartedRoom.href }),
            });
            if (response.status === 429) {
                createMapError = $LL.mapEditor.properties.exit.createMapErrorLimit();
                return;
            }
            if (!response.ok) {
                createMapError = $LL.mapEditor.properties.exit.createMapErrorGeneric();
                return;
            }
            const created = z.object({ roomUrl: z.string() }).parse(await response.json());
            applyCreatedMap(created.roomUrl, name);
        } catch (e) {
            if (abortController.signal.aborted) {
                return;
            }
            console.error(e);
            createMapError = $LL.mapEditor.properties.exit.createMapErrorGeneric();
        } finally {
            setCreatingMap(false);
        }
    }

    onMount(() => {
        fetchMaps()
            .then(() => {
                return fetchStartAreasName();
            })
            .catch((e) => console.error(e));
        fetchCanCreateMap().catch((e) => {
            if (!abortController.signal.aborted) {
                console.error(e);
            }
        });
    });
</script>

<PropertyEditorBase
    onclose={() => {
        onclose?.();
    }}
>
    {#snippet header()}
        <span class="flex justify-center items-center">
            <IconDoorOut font-size="18" class="mr-2" />
            {$LL.mapEditor.properties.exit.label()}
        </span>
    {/snippet}
    {#snippet content()}
        <span>
            <div>
                <Select
                    id="exitMapSelector"
                    label={$LL.mapEditor.properties.exit.exitMap()}
                    bind:value={property.url}
                    onchange={(value: unknown) => {
                        property.areaName = "";
                        onValueChange();
                        fetchStartAreasName().catch((e) => console.error(e));
                    }}
                    onblur={() => {
                        onValueChange();
                        fetchStartAreasName().catch((e) => console.error(e));
                    }}
                >
                    {#each [...mapsUrl.entries()] as map (map[0])}
                        <option value={map[0]} selected={map[0] === property.url}
                            >{mapLabel(map[0], map[1].name)}</option
                        >
                    {/each}
                </Select>
            </div>
            {#if property.url}
                <div>
                    <Select
                        id="startAreaNameSelector"
                        label={$LL.mapEditor.properties.exit.defaultStartArea()}
                        bind:value={property.areaName}
                        onchange={() => {
                            onValueChange();
                            fetchStartAreasName().catch((e) => console.error(e));
                        }}
                        onblur={() => {
                            onValueChange();
                            fetchStartAreasName().catch((e) => console.error(e));
                        }}
                    >
                        <option value="" selected={!property.areaName}
                            >{$LL.mapEditor.properties.exit.defaultStartArea()}</option
                        >
                        {#each startAreas as areaName (areaName)}
                            <option value={areaName} selected={areaName === property.areaName}>{areaName}</option>
                        {/each}
                    </Select>
                </div>
            {/if}
            {#if canCreateMap}
                <div class="mt-3 flex flex-col gap-2" data-testid="createMapBlock">
                    <Input
                        id="newMapName"
                        label={$LL.mapEditor.properties.exit.createMapLabel()}
                        placeholder={$LL.mapEditor.properties.exit.createMapPlaceholder()}
                        maxlength={60}
                        bind:value={newMapName}
                    />
                    <button
                        class="btn bg-transparent rounded-md hover:!bg-white/10 transition-all border !border-white py-2"
                        disabled={isCreatingMap || String(newMapName ?? "").trim().length === 0}
                        onclick={() => {
                            createMap().catch((e) => console.error(e));
                        }}
                        data-testid="createMapButton"
                    >
                        {$LL.mapEditor.properties.exit.createMapButton()}
                    </button>
                    {#if createMapError}
                        <p class="m-0 text-sm text-red-400">{createMapError}</p>
                    {/if}
                </div>
            {/if}
        </span>
    {/snippet}
</PropertyEditorBase>
