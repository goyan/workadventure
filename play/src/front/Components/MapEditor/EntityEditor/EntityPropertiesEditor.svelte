<script lang="ts">
    import type { EntityDataProperties, EntityDataPropertiesKeys, EntityDataProperty } from "@workadventure/map-editor";
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import type { ApplicationDefinitionInterface } from "@workadventure/messages";
    import { v4 as uuid } from "uuid";
    import type { EntityPrefab, PrefabOverride } from "@workadventure/map-editor";
    import {
        mapEditorEntityModeStore,
        mapEditorSelectedEntityPrefabStore,
        mapEditorSelectedEntityStore,
        mapEditorModifyCustomEntityEventStore,
        mapEditorDeleteCustomEntityEventStore,
    } from "../../../Stores/MapEditorStore";
    import { analyticsClient } from "../../../Administration/AnalyticsClient";
    import LL from "../../../../i18n/i18n-svelte";
    import AddPropertyButtonWrapper from "../PropertyEditor/AddPropertyButtonWrapper.svelte";
    import PlayAudioPropertyEditor from "../PropertyEditor/PlayAudioPropertyEditor.svelte";
    import OpenWebsitePropertyEditor from "../PropertyEditor/OpenWebsitePropertyEditor.svelte";

    import { IconChevronDown, IconArrowLeft, IconTrash } from "../../Icons";
    import Input from "../../Input/Input.svelte";
    import TextArea from "../../Input/TextArea.svelte";
    import InputSwitch from "../../Input/InputSwitch.svelte";
    import OpenFilePropertyEditor from "../PropertyEditor/OpenFilePropertyEditor.svelte";
    import type { Entity } from "../../../Phaser/ECS/Entity";
    import { gameManager } from "../../../Phaser/Game/GameManager";
    import Button from "../../UI/Button.svelte";
    import { localUserStore } from "../../../Connection/LocalUserStore";
    import { executeUpdateWAMSettings } from "../../../Phaser/Game/MapEditor/Commands/Facades";
    import { isMapLayerPrefab } from "../../../Phaser/Game/MapEditor/MapLayer/MapLayerCatalog";
    import { getEntityCategory, withCategory } from "../../../Utils/EntityCategory";
    import PlacedImageSizeEditor from "./PlacedImageSizeEditor.svelte";
    import CustomEntityEditionForm from "./CustomEntityEditionForm/CustomEntityEditionForm.svelte";

    const applicationManager = gameManager.getCurrentGameScene().applicationManager;

    let properties: EntityDataProperties = $state([]);
    let entityName = $state("");
    let entityDescription = $state("");
    let entitySearchable = $state(false);
    let showDescriptionField = $state(false);
    let selectedEntity: Entity | undefined = undefined;

    let selectedEntityUnsubscriber = mapEditorSelectedEntityStore.subscribe((currentEntity) => {
        if (currentEntity) {
            currentEntity.setEditColor(0x00ffff);
            properties = currentEntity.getProperties() ?? [];
            entityName = currentEntity.getEntityData().name ?? "";
            const descriptionProperty = properties.find((p) => p.type === "entityDescriptionProperties");
            if (!descriptionProperty) {
                $mapEditorSelectedEntityStore?.addProperty({
                    id: uuid(),
                    type: "entityDescriptionProperties",
                    description: "",
                    searchable: false,
                });
            } else {
                entityDescription = descriptionProperty.description ?? "";
                entitySearchable = descriptionProperty.searchable ?? false;
            }
            selectedEntity = currentEntity;
        }
    });

    function onAddProperty(type: EntityDataPropertiesKeys, subtype?: string) {
        if ($mapEditorSelectedEntityStore) {
            analyticsClient.trackAdminEvent("map_editor.property.added", { name: type || "unknown", type: "entity" });
            const property = getPropertyFromType(type, subtype);
            $mapEditorSelectedEntityStore.addProperty(property);

            // refresh properties
            properties = $mapEditorSelectedEntityStore?.getProperties();
        }
    }

    function onAddSpecificProperty(app: ApplicationDefinitionInterface) {
        if (!$mapEditorSelectedEntityStore) return;
        analyticsClient.trackAdminEvent("map_editor.property.added", { name: app.name, type: "entity" });
        const property: EntityDataProperty = {
            id: uuid(),
            type: "openWebsite",
            application: app.name,
            closable: true,
            buttonLabel: app.name,
            link: "",
            newTab: false,
            placeholder: app.description,
            label: app.name,
            policy: app.policy,
            icon: app.image,
            regexUrl: app.regexUrl,
            targetEmbedableUrl: app.targetUrl,
            forceNewTab: app.forceNewTab,
            allowAPI: app.allowAPI,
            hideUrl: false,
        };
        $mapEditorSelectedEntityStore.addProperty(property);

        // refresh properties
        properties = $mapEditorSelectedEntityStore?.getProperties();
    }

    function onUpdateName() {
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.setEntityName(entityName);
        }
    }

    function onUpdateDescription() {
        let properties = $mapEditorSelectedEntityStore
            ?.getProperties()
            .find((p) => p.type === "entityDescriptionProperties");
        if (!properties || (properties && properties.type !== "entityDescriptionProperties"))
            throw new Error("Wrong property type");

        properties.description = entityDescription;
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(properties));
        }
    }

    function onUpdateSearchable() {
        let properties = $mapEditorSelectedEntityStore
            ?.getProperties()
            .find((p) => p.type === "entityDescriptionProperties");
        if (!properties || (properties && properties.type !== "entityDescriptionProperties"))
            throw new Error("Wrong property type");

        properties.searchable = entitySearchable;
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(properties));
        }
    }

    function onUpdateProperty(property: EntityDataProperty) {
        if ($mapEditorSelectedEntityStore) {
            $mapEditorSelectedEntityStore.updateProperty($state.snapshot(property));
        }
    }

    function getPropertyFromType(type: EntityDataPropertiesKeys, subtype?: string): EntityDataProperty {
        const id = uuid();
        let placeholder: string;
        let buttonLabel: string;
        let policy: string | undefined;
        switch (type) {
            case "jitsiRoomProperty":
                return {
                    id,
                    type,
                    jitsiRoomConfig: {},
                    closable: true,
                    roomName: "JITSI ROOM",
                    buttonLabel: $LL.mapEditor.properties.jitsiRoomProperty.label(),
                };
            case "livekitRoomProperty":
                return {
                    id,
                    type,
                    roomName: "LIVEKIT ROOM",
                    buttonLabel: $LL.mapEditor.properties.livekitRoomProperty.label(),
                    livekitRoomConfig: {
                        startWithAudioMuted: false,
                        startWithVideoMuted: false,
                        disableChat: false,
                        raiseHandEnabled: true,
                    },
                    livekitRoomAdminTag: "",
                };
            case "openFile":
                return {
                    id,
                    type,
                    link: "",
                    name: "",
                    closable: true,
                    newTab: false,
                    buttonLabel: $LL.mapEditor.properties.openFile.label(),
                    policy,
                    width: 50,
                    hideUrl: false,
                };
            case "openWebsite":
                switch (subtype) {
                    case "youtube":
                        placeholder = "https://www.youtube.com/watch?v=Y9ubBWf5w20";
                        buttonLabel = $LL.mapEditor.properties.youtube.label();
                        policy =
                            "fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share;";
                        break;
                    case "klaxoon":
                        placeholder = "https://app.klaxoon.com/";
                        buttonLabel = $LL.mapEditor.properties.klaxoon.label();
                        break;
                    case "googleDrive":
                        placeholder = "https://drive.google.com/file/d/1DjNjZVbVeQO9EvgONLzCtl6wG-kxSr9Z/preview";
                        buttonLabel = $LL.mapEditor.properties.googleDrive.label();
                        break;
                    case "googleDocs":
                        placeholder =
                            "https://docs.google.com/document/d/1iFHmKL4HJ6WzvQI-6FlyeuCy1gzX8bWQ83dNlcTzigk/edit";
                        buttonLabel = $LL.mapEditor.properties.googleDocs.label();
                        break;
                    case "googleSheets":
                        placeholder =
                            "https://docs.google.com/spreadsheets/d/1SBIn3IBG30eeq944OhT4VI_tSg-b1CbB0TV0ejK70RA/edit";
                        buttonLabel = $LL.mapEditor.properties.googleSheets.label();
                        break;
                    case "googleSlides":
                        placeholder =
                            "https://docs.google.com/presentation/d/1fU4fOnRiDIvOoVXbksrF2Eb0L8BYavs7YSsBmR_We3g/edit";
                        buttonLabel = $LL.mapEditor.properties.googleSlides.label();
                        break;
                    case "eraser":
                        placeholder = "https://app.eraser.io/workspace/ExSd8Z4wPsaqMMgTN4VU";
                        buttonLabel = $LL.mapEditor.properties.eraser.label();
                        break;
                    case "excalidraw":
                        placeholder = "https://excalidraw.workadventu.re/";
                        buttonLabel = $LL.mapEditor.properties.excalidraw.label();
                        break;
                    case "cards":
                        placeholder =
                            "https://member.workadventu.re?tenant=<your cards tenant>&learning=<Your cards learning>";
                        buttonLabel = $LL.mapEditor.properties.cards.label();
                        break;
                    default:
                        placeholder = "https://workadventu.re";
                        buttonLabel = $LL.mapEditor.properties.openWebsite.label();
                }
                return {
                    id,
                    type,
                    closable: true,
                    buttonLabel,
                    link: "",
                    newTab: false,
                    application: subtype ?? "website",
                    placeholder,
                    forceNewTab: false,
                    allowAPI: false,
                    policy,
                    width: 50,
                    hideUrl: false,
                };
            case "playAudio":
                return {
                    id,
                    type,
                    buttonLabel: $LL.mapEditor.properties.playAudio.label(),
                    audioLink: "",
                    volume: 1,
                    playForAllUsers: true,
                };
            default:
                throw new Error(`Unknown property type ${type}`);
        }
    }

    function onDeleteProperty(id: string) {
        if ($mapEditorSelectedEntityStore) {
            analyticsClient.trackAdminEvent("map_editor.property.removed", {
                name: properties.find((p) => p.id === id)?.type || "unknown",
                type: "entity",
            });
            $mapEditorSelectedEntityStore.deleteProperty(id);
            // refresh properties
            properties = $mapEditorSelectedEntityStore?.getProperties();
            // $mapEditorSelectedEntityStore.delete();
            // mapEditorSelectedEntityStore.set(undefined);
            // mapEditorEntityModeStore.set("ADD");
        }
    }

    function deleteSelectedEntity() {
        // Same as the Delete key: the entity tool removes the entity through a command.
        $mapEditorSelectedEntityStore?.delete();
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
    }

    function backToSelectObject() {
        mapEditorSelectedEntityStore.set(undefined);
        mapEditorSelectedEntityPrefabStore.set(undefined);
        mapEditorEntityModeStore.set("ADD");
    }

    onDestroy(() => {
        selectedEntityUnsubscriber();
        selectedEntity?.removeEditColor();
    });

    function toggleDescriptionField() {
        showDescriptionField = !showDescriptionField;
    }

    // A placed image takes its display level, hitbox and water from its model in the library: editing the model from
    // here updates every copy of it on the map. A custom image is edited in the library itself; an object of a
    // built-in collection (read-only catalog file) is adjusted for this map only (PrefabOverride in the WAM file).
    let editedModel: EntityPrefab | undefined = $state(undefined);
    // Selecting another object on the map closes the form of the previous one.
    let editedEntityId: string | undefined;
    $effect(() => {
        const selectedId = $mapEditorSelectedEntityStore?.entityId;
        if (selectedId !== editedEntityId) {
            editedEntityId = selectedId;
            editedModel = undefined;
        }
    });
    const userCanEditMap = gameManager.getCurrentGameScene().connection?.userCanEdit ?? false;

    function canEditModel(prefab: EntityPrefab): boolean {
        if (prefab.type === "Custom") {
            return (
                userCanEditMap ||
                (prefab.ownerId !== undefined && prefab.ownerId === localUserStore.getLocalUser()?.uuid)
            );
        }
        return userCanEditMap && !isMapLayerPrefab(prefab.collectionName, prefab.id);
    }

    function hasMapOverride(prefab: EntityPrefab): boolean {
        return gameManager.getCurrentGameScene().wamFile?.settings?.prefabOverrides?.[prefab.id] !== undefined;
    }

    /**
     * Saves the model and carries the change over to the whole family of the object, so that its copies need not be
     * fixed one by one: the display level and the category go to every view and color of it, the hitbox and the water
     * to the other colors of the same view (same drawing, same shape).
     */
    function saveModel(model: EntityPrefab) {
        const shapeFields = (source: EntityPrefab) => ({
            collisionGrid: source.collisionGrid,
            collisionRectangles: source.collisionRectangles,
            water: source.water,
        });
        const family = getFamily(model);
        const category = getEntityCategory(model);
        // Same name, other model (the same image uploaded twice, another catalog): it takes the category too.
        const lookalikes = getLookalikes(model).filter((prefab) => !family.some((member) => member.id === prefab.id));
        for (const lookalike of lookalikes) {
            if (category === undefined || getEntityCategory(lookalike) === category) continue;
            if (lookalike.type === "Custom") {
                mapEditorModifyCustomEntityEventStore.set(
                    $state.snapshot({ ...lookalike, tags: withCategory(lookalike.tags, category) }),
                );
            } else {
                const current = gameManager.getCurrentGameScene().wamFile?.settings?.prefabOverrides?.[lookalike.id];
                saveMapOverride(lookalike.id, {
                    ...(current ?? {
                        layer: lookalike.layer,
                        depthOffset: lookalike.depthOffset,
                        collisionGrid: lookalike.collisionGrid,
                        collisionRectangles: lookalike.collisionRectangles,
                        water: lookalike.water,
                    }),
                    category,
                });
            }
        }
        for (const member of family) {
            const adjusted: EntityPrefab =
                member.id === model.id
                    ? model
                    : {
                          ...member,
                          tags: withCategory(member.tags, getEntityCategory(model) ?? ""),
                          layer: model.layer,
                          ...(member.direction === model.direction ? shapeFields(model) : {}),
                      };
            if (adjusted.type === "Custom") {
                mapEditorModifyCustomEntityEventStore.set($state.snapshot(adjusted));
            } else {
                saveMapOverride(adjusted.id, {
                    layer: adjusted.layer,
                    depthOffset: adjusted.depthOffset,
                    category: getEntityCategory(adjusted),
                    ...shapeFields(adjusted),
                });
            }
        }
        editedModel = undefined;
    }

    /** Objects of the library with the same name, whatever their catalog. */
    function getLookalikes(prefab: EntityPrefab): EntityPrefab[] {
        const name = prefab.name.trim().toLocaleLowerCase();
        return get(gameManager.getCurrentGameScene().getEntitiesCollectionsManager().getEntitiesPrefabsVariantStore())
            .flatMap((variant) => variant.colors.flatMap((color) => variant.getEntityPrefabsPositions(color)))
            .filter((candidate) => candidate.name.trim().toLocaleLowerCase() === name);
    }

    /** Every view and color of the object the prefab belongs to (itself when it has none). */
    function getFamily(prefab: EntityPrefab): EntityPrefab[] {
        const variant = get(
            gameManager.getCurrentGameScene().getEntitiesCollectionsManager().getEntitiesPrefabsVariantStore(),
        ).find((candidate) => candidate.prefabIds.includes(prefab.id));
        if (!variant) return [prefab];
        return variant.colors.flatMap((color) => variant.getEntityPrefabsPositions(color));
    }

    function saveMapOverride(prefabId: string, override: PrefabOverride | undefined) {
        executeUpdateWAMSettings({
            $case: "updatePrefabOverrideSettingMessage",
            updatePrefabOverrideSettingMessage: { prefabId, override: $state.snapshot(override) },
        }).catch((e) => console.error(e));
    }
</script>

{#if editedModel}
    <div class="flex flex-col gap-2 p-1" data-testid="entityModelForm">
        <CustomEntityEditionForm
            customEntity={editedModel}
            closeForm={() => (editedModel = undefined)}
            applyEntityModifications={saveModel}
            profileOnly={editedModel.type !== "Custom"}
            resetProfile={editedModel.type !== "Custom" && hasMapOverride(editedModel)
                ? () => {
                      if (editedModel) saveMapOverride(editedModel.id, undefined);
                      editedModel = undefined;
                  }
                : undefined}
            removeEntity={({ entityId }) => {
                mapEditorDeleteCustomEntityEventStore.set({ id: entityId });
                editedModel = undefined;
            }}
        />
    </div>
{:else if $mapEditorSelectedEntityStore === undefined}
    {$LL.mapEditor.entityEditor.editInstructions()}
{:else}
    <div class="overflow-x-hidden overflow-y-auto">
        <div class="header-container">
            <h3>{$LL.mapEditor.entityEditor.editing({ name: $mapEditorSelectedEntityStore.getPrefab().name })}</h3>
        </div>
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <p
            onclick={(event) => {
                event.preventDefault();
                backToSelectObject();
            }}
            class="flex flex-row items-center text-xs m-0"
        >
            <IconArrowLeft font-size="12" class="cursor-pointer" />
            <span class="ml-1 cursor-pointer">{$LL.mapEditor.entityEditor.itemPicker.backToSelectObject()}</span>
        </p>
        <button
            type="button"
            class="flex flex-row items-center gap-2 p-2 my-2 rounded text-sm bg-danger"
            data-testid="deleteEntityButton"
            onclick={deleteSelectedEntity}
        >
            <IconTrash font-size="18" />
            <span>{$LL.mapEditor.entityEditor.deleteButton()}</span>
        </button>
        <div class="properties-buttons flex flex-row m-2">
            <AddPropertyButtonWrapper
                property="playAudio"
                onclick={() => {
                    onAddProperty("playAudio");
                }}
            />
        </div>
        <div class="properties-buttons flex flex-row flex-wrap m-2">
            <AddPropertyButtonWrapper
                property="openWebsite"
                onclick={() => {
                    onAddProperty("openWebsite");
                }}
            />
            <AddPropertyButtonWrapper
                property="openFile"
                onclick={() => {
                    onAddProperty("openFile");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="klaxoon"
                onclick={() => {
                    onAddProperty("openWebsite", "klaxoon");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="youtube"
                onclick={() => {
                    onAddProperty("openWebsite", "youtube");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="googleDrive"
                onclick={() => {
                    onAddProperty("openWebsite", "googleDrive");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="googleDocs"
                onclick={() => {
                    onAddProperty("openWebsite", "googleDocs");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="googleSheets"
                onclick={() => {
                    onAddProperty("openWebsite", "googleSheets");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="googleSlides"
                onclick={() => {
                    onAddProperty("openWebsite", "googleSlides");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="eraser"
                onclick={() => {
                    onAddProperty("openWebsite", "eraser");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="excalidraw"
                onclick={() => {
                    onAddProperty("openWebsite", "excalidraw");
                }}
            />
            <AddPropertyButtonWrapper
                property="openWebsite"
                subProperty="tldraw"
                onclick={() => {
                    onAddProperty("openWebsite", "tldraw");
                }}
            />
        </div>
        <div class="properties-buttons flex flex-row flex-wrap m-2">
            {#each applicationManager.applications as app, index (`my-own-app-${index}`)}
                <AddPropertyButtonWrapper
                    property="openWebsite"
                    subProperty={app.name}
                    onclick={() => {
                        onAddSpecificProperty(app);
                    }}
                />
            {/each}
        </div>
        <div class="entity-name-container">
            <Input
                id="objectName"
                label={$LL.mapEditor.entityEditor.objectName()}
                type="text"
                placeholder={$LL.mapEditor.entityEditor.objectNamePlaceholder()}
                bind:value={entityName}
                onchange={onUpdateName}
            />
        </div>
        {#if $mapEditorSelectedEntityStore.getPrefab().type === "Custom" && $mapEditorSelectedEntityStore.visible}
            {#key `${$mapEditorSelectedEntityStore.entityId}:${$mapEditorSelectedEntityStore.getPrefab().id}`}
                <PlacedImageSizeEditor entity={$mapEditorSelectedEntityStore} />
            {/key}
        {/if}
        {#if $mapEditorSelectedEntityStore.visible}
            {#if canEditModel($mapEditorSelectedEntityStore.getPrefab())}
                <Button
                    size="sm"
                    variant="contrast"
                    dataTestId="editEntityModel"
                    onclick={() => (editedModel = $state.snapshot($mapEditorSelectedEntityStore.getPrefab()))}
                >
                    {$mapEditorSelectedEntityStore.getPrefab().type === "Custom"
                        ? $LL.mapEditor.entityEditor.editModel()
                        : $LL.mapEditor.entityEditor.adjustModelForMap()}
                </Button>
            {/if}
        {/if}
        <div class="entity-name-container">
            {#if !showDescriptionField}
                <a
                    href="#addDescriptionField"
                    class="pl-0 text-blue-500 flex flex-row items-center"
                    onclick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleDescriptionField();
                    }}>+ {$LL.mapEditor.entityEditor.addDescriptionField()}</a
                >
            {:else}
                <button class="pl-0 text-blue-500 flex flex-row items-center" onclick={toggleDescriptionField}>
                    <IconChevronDown />{$LL.mapEditor.entityEditor.addDescriptionField()}</button
                >

                <TextArea
                    label={$LL.mapEditor.entityEditor.objectDescription()}
                    id="objectDescription"
                    placeHolder={$LL.mapEditor.entityEditor.objectDescriptionPlaceholder()}
                    bind:value={entityDescription}
                    onchange={onUpdateDescription}
                    onkeypress={() => {}}
                />
            {/if}
        </div>

        <InputSwitch
            label={$LL.mapEditor.entityEditor.objectSearchable()}
            id="searchable"
            bind:value={entitySearchable}
            onchange={onUpdateSearchable}
        />

        <div class="properties-container flex flex-col gap-8 p-1">
            {#each properties as property, i (property.id)}
                {#if property.type !== "entityDescriptionProperties"}
                    <div class="property-box border border-solid border-white/20 bg-white/5 rounded p-2">
                        {#if properties[i].type === "playAudio"}
                            <PlayAudioPropertyEditor
                                bind:property={properties[i]}
                                onclose={() => {
                                    onDeleteProperty(property.id);
                                }}
                                onchange={() => onUpdateProperty(properties[i])}
                            />
                        {:else if properties[i].type === "openWebsite"}
                            <OpenWebsitePropertyEditor
                                bind:property={properties[i]}
                                triggerOptionActivated={false}
                                onclose={() => {
                                    onDeleteProperty(property.id);
                                }}
                                onchange={() => onUpdateProperty(properties[i])}
                            />
                        {:else if properties[i].type === "openFile"}
                            <OpenFilePropertyEditor
                                bind:property={properties[i]}
                                onclose={() => {
                                    onDeleteProperty(property.id);
                                }}
                                onchange={() => onUpdateProperty(properties[i])}
                            />
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    </div>
{/if}

<style>
    .properties-container {
        overflow-y: auto;
        overflow-x: hidden;
    }

    .properties-container::-webkit-scrollbar {
        display: none;
    }

    .entity-name-container {
        display: flex;
        width: 100%;
        margin-bottom: 0.5em;
        margin-top: 0.5em;
        flex-direction: column;

        * {
            margin-bottom: 0;
        }
    }
</style>
