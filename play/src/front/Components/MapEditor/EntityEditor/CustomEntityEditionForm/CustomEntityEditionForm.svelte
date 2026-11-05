<script lang="ts">
    import type { CollisionRectangle, EntityAnimation, EntityLayer, EntityPrefab } from "@workadventure/map-editor";
    import { MAX_ENTITY_ANIMATION_FRAME_COUNT, MAX_ENTITY_ANIMATION_FRAME_RATE } from "@workadventure/map-editor";
    import { get } from "svelte/store";
    import {
        DEFAULT_ENTITY_ANIMATION_FRAME_RATE,
        detectEntityAnimationFrameCount,
    } from "../../../../Utils/EntityAnimationDetection";
    import LL from "../../../../../i18n/i18n-svelte";
    import EntityImage from "../EntityItem/EntityImage.svelte";
    import type { InputTagOption } from "../../../Input/InputTagOption";
    import InputTags from "../../../Input/InputTags.svelte";
    import Select from "../../../Input/Select.svelte";
    import Input from "../../../Input/Input.svelte";
    import InputCheckbox from "../../../Input/InputCheckbox.svelte";
    import {
        computeFootprint,
        computeOpaqueBounds,
        computeWaterArea,
        getDefaultWaterMargin,
    } from "../../../../Utils/EntityFootprint";
    import { gameManager } from "../../../../Phaser/Game/GameManager";
    import { categoryLabel } from "../../../../Utils/CategoryLabel";
    import { getCategorySettings, listMapCategories } from "../../../../Utils/ObjectCategories";
    import {
        formatCategory,
        getEntityCategory,
        isSeatObject,
        isStructureObject,
        listCategories,
        withCategory,
    } from "../../../../Utils/EntityCategory";
    import EntityEditionCollisionGrid from "./EntityEditionCollisionGrid.svelte";
    import EntityShapesOverlay from "./EntityShapesOverlay.svelte";
    import EntityShapeEditor from "./EntityShapeEditor.svelte";
    import EntityRectangleInputs from "./EntityRectangleInputs.svelte";

    interface Props {
        customEntity: EntityPrefab;
        isUploadForm?: boolean;
        closeForm?: () => void;
        removeEntity?: (payload: { entityId: string }) => void;
        applyEntityModifications?: (entity: EntityPrefab) => void;
        /** Only the display level, hitbox and water: an object of a built-in collection, adjusted for this map. */
        profileOnly?: boolean;
        /** Shown in profile-only mode when the map already adjusts the object: back to the catalog settings. */
        resetProfile?: () => void;
    }

    let {
        customEntity,
        isUploadForm = false,
        closeForm = () => {},
        removeEntity = () => {},
        applyEntityModifications = () => {},
        profileOnly = false,
        resetProfile = undefined,
    }: Props = $props();

    let {
        name,
        tags,
        collisionGrid: customEntityCollisionGrid,
        depthOffset: depthOffsetCustomEntity,
    } = $state((() => customEntity)());
    let inputTagOptions: InputTagOption[] | undefined = $state(tags.map((tag) => ({ value: tag, label: tag })));

    let collisionGrid = $state(customEntityCollisionGrid ? customEntityCollisionGrid.map((row) => [...row]) : []);
    let floatingObject = $state((() => (isUploadForm ? false : customEntityCollisionGrid === undefined))());
    let depthOffset: number = $state(depthOffsetCustomEntity ? depthOffsetCustomEntity * -1 : 0);
    let entityImageRef: HTMLImageElement | undefined = $state();
    let entityImageHeight = $state(0);
    const initialAnimation = (() => customEntity.animation)();
    let animated = $state(initialAnimation !== undefined);
    let frameCount = $state(initialAnimation?.frameCount ?? 2);
    let frameRate = $state(initialAnimation?.frameRate ?? DEFAULT_ENTITY_ANIMATION_FRAME_RATE);
    // The animation is chosen once, on upload: the placed copies of the image are not re-cut afterwards.
    const animation: EntityAnimation | undefined = $derived(
        isUploadForm
            ? animated && isValidAnimation(frameCount, frameRate)
                ? { frameCount, frameRate }
                : undefined
            : initialAnimation,
    );
    let displayDepthCustomSelector = $state(false);

    // Precise hitbox (pixels) and water, prefilled from the opaque pixels of the image.
    let layer: EntityLayer | undefined = $state((() => customEntity.layer)());
    let hitbox: CollisionRectangle[] = $state((() => customEntity.collisionRectangles?.map((r) => ({ ...r })) ?? [])());
    let water: CollisionRectangle[] = $state((() => customEntity.water?.map((r) => ({ ...r })) ?? [])());
    let hasWater = $state((() => (customEntity.water?.length ?? 0) > 0)());
    let waterMargin: number | null = $state(null);
    let imagePixels: ImageData | undefined;
    const frameWidth = $derived(
        entityImageRef ? Math.floor(entityImageRef.naturalWidth / (animation?.frameCount ?? 1)) : 0,
    );
    const frameHeight = $derived(entityImageRef?.naturalHeight ?? 0);
    const isStanding = $derived(layer === undefined || layer === "standing");
    // A floating object is only placed off the grid: standing, it still needs a hitbox, in pixels.
    const needsHitbox = $derived(isStanding);
    const hasHitbox = $derived(
        hitbox.length > 0 || (!floatingObject && collisionGrid.some((row) => row.some((cell) => cell === 1))),
    );
    const TT = $derived($LL.mapEditor.entityEditor.customEntityEditorForm);

    // Saving rebuilds the collisions of the map, which freezes the page for a moment: the button shows it is working
    // and cannot be clicked again, and the work only starts once that state is on screen.
    let saving = $state(false);

    function save() {
        runSaving(() => applyEntityModifications(getModifiedCustomEntity()));
    }

    function runSaving(action: () => void) {
        if (saving) return;
        saving = true;
        requestAnimationFrame(() =>
            setTimeout(() => {
                try {
                    action();
                } finally {
                    // The form usually closes right after; when it stays (an upload in progress), allow a new try.
                    setTimeout(() => (saving = false), 1500);
                }
            }, 0),
        );
    }
    // The enlarged editor replaces the small preview as soon as there is a hitbox or water to adjust.
    const showShapeEditor = $derived(
        frameWidth > 0 &&
            frameHeight > 0 &&
            ((needsHitbox && hitbox.length > 0) ||
                (layer === "floor" && hasWater && water.length > 0) ||
                displayDepthCustomSelector),
    );

    /** Category names once each, whatever their case, in order. */
    function listCategoryNames(...lists: string[][]): string[] {
        const names = lists.flat();
        return names.filter(
            (name, index) =>
                names.findIndex((other) => other.toLocaleLowerCase() === name.toLocaleLowerCase()) === index,
        );
    }

    // Every object of the library belongs to a category: chosen among the existing ones, or created here.
    const NEW_CATEGORY = "__new__";
    const mapCategories = gameManager.getCurrentGameScene().wamFile?.settings?.categories;
    const knownCategories = listCategoryNames(
        listMapCategories(mapCategories).map((category) => formatCategory(category.id)),
        listCategories(
            get(gameManager.getCurrentGameScene().getEntitiesCollectionsManager().getEntitiesPrefabsVariantStore())
                .map((variant) => variant.defaultPrefab)
                .filter((prefab) => !isStructureObject(prefab)),
        ),
    );
    let category: string = $state((() => getEntityCategory(customEntity) ?? "")());
    // A category may set the display level of its objects (rugs on the floor, lights above): picking it applies it.
    let previousCategory = (() => getEntityCategory(customEntity) ?? "")();
    $effect(() => {
        if (category === previousCategory) return;
        previousCategory = category;
        const level = getCategorySettings(category, mapCategories)?.layer;
        if (level === "floor") selectedDepthOption = depthOptions.GROUND_LEVEL;
        else if (level === "overhead") selectedDepthOption = depthOptions.OVERHEAD;
        else if (level === "standing") selectedDepthOption = depthOptions.STANDING;
    });
    let newCategory = $state("");
    const effectiveCategory = $derived(category === NEW_CATEGORY ? newCategory.trim() : category);
    const categoryOptions = $derived([
        { value: "", label: $LL.mapEditor.entityEditor.customEntityEditorForm.category.choose() },
        ...knownCategories.map((known) => ({ value: known, label: categoryLabel(known) })),
        ...(category !== "" && category !== NEW_CATEGORY && !knownCategories.includes(category)
            ? [{ value: category, label: category }]
            : []),
        { value: NEW_CATEGORY, label: $LL.mapEditor.entityEditor.customEntityEditorForm.category.new() },
    ]);
    // Players sit on it by walking onto it: proposed for chairs, couches… (by name or category), always editable.
    let sittable: boolean = $state((() => customEntity.sittable ?? isSeatObject(customEntity))());

    // Which side of the object the image shows: an object with several views can be turned once placed.
    let direction: string = $state((() => customEntity.direction)());
    const viewOptions = $derived([
        { value: "Down", label: $LL.mapEditor.entityEditor.views.front() },
        { value: "Up", label: $LL.mapEditor.entityEditor.views.back() },
        { value: "Left", label: $LL.mapEditor.entityEditor.views.left() },
        { value: "Right", label: $LL.mapEditor.entityEditor.views.right() },
    ]);
    const canApply = $derived((!needsHitbox || hasHitbox) && (profileOnly || effectiveCategory !== ""));

    const depthOptions = {
        GROUND_LEVEL: "GroundLevel",
        STANDING: "Standing",
        OVERHEAD: "Overhead",
        CUSTOM: "Custom",
    } as const;

    type DepthOption = (typeof depthOptions)[keyof typeof depthOptions];

    let selectedDepthOption: DepthOption = $state(
        (() =>
            customEntity.layer === "floor"
                ? depthOptions.GROUND_LEVEL
                : customEntity.layer === "overhead"
                  ? depthOptions.OVERHEAD
                  : depthOffset === 0
                    ? depthOptions.STANDING
                    : depthOptions.CUSTOM)(),
    );

    function getModifiedCustomEntity(): EntityPrefab {
        return {
            ...customEntity,
            name: name,
            tags: withCategory(
                inputTagOptions !== undefined ? inputTagOptions.map((tagOption) => tagOption.value) : [],
                effectiveCategory,
            ),
            direction: isUploadForm ? (direction as EntityPrefab["direction"]) : customEntity.direction,
            collisionGrid: floatingObject ? undefined : collisionGrid,
            depthOffset: depthOffset !== 0 ? -depthOffset : 0,
            animation,
            layer: layer === "standing" ? undefined : layer,
            collisionRectangles: needsHitbox && hitbox.length > 0 ? $state.snapshot(hitbox) : undefined,
            water: layer === "floor" && hasWater && water.length > 0 ? $state.snapshot(water) : undefined,
            sittable,
        };
    }

    function isValidAnimation(frameCount: number, frameRate: number): boolean {
        return (
            Number.isInteger(frameCount) &&
            frameCount >= 2 &&
            frameCount <= MAX_ENTITY_ANIMATION_FRAME_COUNT &&
            frameRate > 0 &&
            frameRate <= MAX_ENTITY_ANIMATION_FRAME_RATE &&
            (entityImageRef === undefined || entityImageRef.naturalWidth >= frameCount)
        );
    }

    /** Ticks the animation box when the uploaded image looks like a strip of frames, with its number of frames. */
    function detectAnimation(imageRef: HTMLImageElement) {
        const canvas = document.createElement("canvas");
        canvas.width = imageRef.naturalWidth;
        canvas.height = imageRef.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context || canvas.width === 0 || canvas.height === 0) return;
        context.drawImage(imageRef, 0, 0);
        const detectedFrameCount = detectEntityAnimationFrameCount(
            context.getImageData(0, 0, canvas.width, canvas.height),
        );
        if (detectedFrameCount !== undefined) {
            animated = true;
            frameCount = detectedFrameCount;
        }
    }

    const COLLISION_GRID_SIZE = 32;

    function onImageLoad(imageRef: HTMLImageElement) {
        const firstLoad = entityImageRef === undefined;
        entityImageRef = imageRef;
        if (firstLoad && isUploadForm) {
            detectAnimation(imageRef);
        }
        generateCollisionGridIfNotExists(animation?.frameCount ?? 1);
        if (firstLoad) {
            imagePixels = readPixels(imageRef);
            // Images uploaded before "Ground level" became a layer only had the depth offset of their height.
            if (!customEntity.layer && depthOffset !== 0 && depthOffset === imageRef.naturalHeight) {
                selectedDepthOption = depthOptions.GROUND_LEVEL;
            }
            // A standing object never goes without a hitbox: one is proposed, from the image, until it is saved.
            if (hitbox.length === 0 && !hasHitbox) {
                regenerateHitbox();
            }
            if (hasWater && water.length === 0) {
                regenerateWater();
            }
        }
    }

    /**
     * The pixels of the image, to find its opaque part. An image served from another origin without CORS headers
     * cannot be read: the shapes then fall back to the whole frame.
     */
    function readPixels(imageRef: HTMLImageElement): ImageData | undefined {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = imageRef.naturalWidth;
            canvas.height = imageRef.naturalHeight;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context || canvas.width === 0 || canvas.height === 0) return undefined;
            context.drawImage(imageRef, 0, 0);
            return context.getImageData(0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.warn("Cannot read the pixels of the entity image, using its whole frame", e);
            return undefined;
        }
    }

    function regenerateHitbox() {
        const generated = imagePixels ? computeFootprint(imagePixels, frameWidth) : undefined;
        hitbox = [
            generated ?? {
                x: 0,
                y: Math.round(frameHeight * 0.65),
                width: frameWidth,
                height: Math.max(1, frameHeight - Math.round(frameHeight * 0.65)),
            },
        ];
    }

    function regenerateWater() {
        const bounds = (imagePixels && computeOpaqueBounds(imagePixels, frameWidth)) ?? {
            x: 0,
            y: 0,
            width: frameWidth,
            height: frameHeight,
        };
        waterMargin ??= getDefaultWaterMargin(bounds);
        const margin = Math.max(0, Number(waterMargin) || 0);
        const generated = imagePixels
            ? computeWaterArea(imagePixels, frameWidth, margin)
            : {
                  x: margin,
                  y: margin,
                  width: frameWidth - margin * 2,
                  height: frameHeight - margin * 2,
              };
        water = generated && generated.width > 0 && generated.height > 0 ? [generated] : [];
    }

    /**
     * One cell per 32px of a frame: the collision grid covers one frame of an animated strip. On upload, the grid is
     * redrawn when the number of frames changes the width of a frame.
     */
    function generateCollisionGridIfNotExists(imageFrameCount: number) {
        if (!entityImageRef) return;
        const nbColumn = Math.ceil(entityImageRef.naturalWidth / imageFrameCount / COLLISION_GRID_SIZE);
        const nbRow = Math.ceil(entityImageRef.naturalHeight / COLLISION_GRID_SIZE);
        const sizeChanged = collisionGrid.length !== nbRow || collisionGrid[0]?.length !== nbColumn;
        if (collisionGrid.length === 0 || (isUploadForm && sizeChanged)) {
            collisionGrid = Array(nbRow)
                .fill(0)
                .map(() => Array(nbColumn).fill(0));
        }
    }

    function updateCollisionGrid(rowIndex: number, columnIndex: number) {
        collisionGrid[rowIndex][columnIndex] = collisionGrid[rowIndex][columnIndex] === 0 ? 1 : 0;
    }

    function updateDepthOffset(depthOption: DepthOption) {
        displayDepthCustomSelector = depthOption === depthOptions.CUSTOM;
        if (depthOption === depthOptions.STANDING || depthOption === depthOptions.OVERHEAD) {
            depthOffset = 0;
        }
        if (depthOption === depthOptions.GROUND_LEVEL) {
            // Kept with the layer, for the clients that do not know layers yet.
            depthOffset = entityImageRef?.naturalHeight ?? 0;
        }
        layer =
            depthOption === depthOptions.GROUND_LEVEL
                ? "floor"
                : depthOption === depthOptions.OVERHEAD
                  ? "overhead"
                  : undefined;
    }

    function getTranslationForDepthOption(depthOption: DepthOption) {
        if (depthOption === depthOptions.STANDING) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.standing();
        }
        if (depthOption === depthOptions.CUSTOM) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.custom();
        }
        if (depthOption === depthOptions.OVERHEAD) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.overhead();
        }
        return $LL.mapEditor.entityEditor.customEntityEditorForm.groundLevel();
    }

    $effect(() => {
        if (isUploadForm) {
            generateCollisionGridIfNotExists(animation?.frameCount ?? 1);
        }
    });

    $effect(() => {
        if (selectedDepthOption) {
            updateDepthOffset(selectedDepthOption);
        }
    });
</script>

{#snippet categoryField()}
    <div class="flex flex-col gap-1">
        <Select
            id="category"
            dataTestId="entityCategory"
            label={$LL.mapEditor.entityEditor.customEntityEditorForm.category.label()}
            options={categoryOptions}
            bind:value={category}
        />
        {#if category === NEW_CATEGORY}
            <Input
                id="newCategory"
                dataTestId="newCategory"
                placeholder={$LL.mapEditor.entityEditor.customEntityEditorForm.category.newName()}
                bind:value={newCategory}
            />
        {/if}
        {#if effectiveCategory === ""}
            <span class="text-xs text-red-400" data-testid="categoryRequired"
                >{$LL.mapEditor.entityEditor.customEntityEditorForm.category.required()}</span
            >
        {/if}
    </div>
{/snippet}

<!-- A 16-bit game menu: framed panel, pixel titles, a scrolling body and actions always in view at the bottom. -->
<div class="retro-form retro-panel" data-testid="entityForm">
    <header class="retro-header">
        <span class="retro-heading">
            {isUploadForm ? TT.titles.upload() : profileOnly ? TT.titles.adjust() : TT.titles.edit()}
        </span>
        {#if !isUploadForm}
            <span class="retro-subtitle" title={customEntity.name}>{customEntity.name}</span>
        {/if}
    </header>

    <div class="retro-body">
        <div class="retro-preview">
            {#if showShapeEditor}
                <div class="flex flex-col items-center gap-2">
                    <EntityShapeEditor
                        imageSource={customEntity.imagePath}
                        {frameWidth}
                        {frameHeight}
                        frameCount={animation?.frameCount ?? 1}
                        hitbox={needsHitbox ? hitbox[0] : undefined}
                        water={layer === "floor" && hasWater ? water[0] : undefined}
                        active={needsHitbox ? "hitbox" : "water"}
                        onHitboxChange={(rectangle) => (hitbox = [rectangle])}
                        onWaterChange={(rectangle) => (water = [rectangle])}
                        depthLine={displayDepthCustomSelector ? frameHeight - depthOffset : undefined}
                        onDepthLineChange={(row) => (depthOffset = frameHeight - row)}
                        labelBehind={TT.depthLine.behind()}
                        labelInFront={TT.depthLine.inFront()}
                    />
                    <span class="retro-hint text-center">{TT.shapeEditorHint()}</span>
                </div>
            {/if}
            <div class="relative flex items-center checkerboard" class:hidden={showShapeEditor}>
                {#if !floatingObject}
                    <EntityEditionCollisionGrid
                        {collisionGrid}
                        {updateCollisionGrid}
                        collisionGridHeight={entityImageHeight}
                    />
                {/if}
                <EntityImage
                    classNames="w-32 max-h-32 object-contain pixelated"
                    imageLoad={(image) => onImageLoad(image)}
                    imageSource={customEntity.imagePath}
                    imageAlt={customEntity.name}
                    {animation}
                    bind:displayedHeight={entityImageHeight}
                />
                <EntityShapesOverlay
                    {frameWidth}
                    {frameHeight}
                    displayedHeight={entityImageHeight}
                    hitbox={needsHitbox ? hitbox : []}
                    water={layer === "floor" && hasWater ? water : []}
                />
            </div>
        </div>

        {#if profileOnly}
            <p class="retro-hint">{TT.profileOnlyDescription()}</p>
        {/if}

        <section class="retro-card">
            <h4 class="retro-title">{TT.sections.identity()}</h4>
            {#if !profileOnly}
                <Input bind:value={name} id="name" data-testid="name" label={TT.imageName()} />
            {/if}
            {@render categoryField()}
            {#if !profileOnly}
                <div class="flex flex-col gap-1">
                    <label class="retro-label" for="tags">{TT.tags()}</label>
                    <InputTags bind:value={inputTagOptions} placeholder={TT.writeTag()} />
                </div>
            {/if}
            {#if isUploadForm}
                <div class="flex flex-col gap-1">
                    <span class="retro-label">{$LL.mapEditor.entityEditor.views.label()}</span>
                    <div class="retro-choices" role="radiogroup" data-testid="entityView">
                        {#each viewOptions as option (option.value)}
                            <button
                                type="button"
                                role="radio"
                                aria-checked={direction === option.value}
                                class="retro-choice"
                                class:selected={direction === option.value}
                                onclick={() => (direction = option.value)}>{option.label}</button
                            >
                        {/each}
                    </div>
                </div>
            {/if}
        </section>

        <section class="retro-card">
            <h4 class="retro-title">{TT.depth()}</h4>
            <p class="retro-hint">{TT.sections.displayDescription()}</p>
            {#if displayDepthCustomSelector}
                <p class="retro-hint" data-testid="depthLineHint">{TT.depthLine.hint()}</p>
            {/if}
            <div class="retro-choices" role="radiogroup" data-testid="entityDepth">
                {#each Object.values(depthOptions) as option (option)}
                    <button
                        type="button"
                        role="radio"
                        aria-checked={selectedDepthOption === option}
                        class="retro-choice"
                        class:selected={selectedDepthOption === option}
                        onclick={() => (selectedDepthOption = option)}>{getTranslationForDepthOption(option)}</button
                    >
                {/each}
            </div>
        </section>

        {#if needsHitbox}
            <section class="retro-card" data-testid="entityHitbox">
                <h4 class="retro-title retro-title-red">{TT.hitbox.title()}</h4>
                <p class="retro-hint">{TT.hitbox.description()}</p>
                {#if hitbox[0]}
                    <EntityRectangleInputs bind:rectangle={hitbox[0]} maxWidth={frameWidth} maxHeight={frameHeight} />
                {/if}
                {#if !hasHitbox}
                    <span class="retro-error" data-testid="hitboxRequired">{TT.hitbox.required()}</span>
                {/if}
                <button type="button" class="retro-btn" onclick={regenerateHitbox}>{TT.hitbox.regenerate()}</button>
            </section>
        {/if}

        <section class="retro-card" data-testid="entityInteraction">
            <h4 class="retro-title">{TT.sections.interaction()}</h4>
            <div class="flex items-start gap-2">
                <InputCheckbox id="sittable" dataTestId="sittable" bind:value={sittable} />
                <label class="m-0 flex cursor-pointer flex-col" for="sittable">
                    <span>{TT.sittable.label()}</span>
                    <span class="retro-hint">{TT.sittable.description()}</span>
                </label>
            </div>
        </section>

        {#if layer === "floor"}
            <section class="retro-card" data-testid="entityWater">
                <h4 class="retro-title retro-title-blue">{TT.water.title()}</h4>
                <p class="retro-hint">{TT.water.description()}</p>
                <div class="flex items-center gap-2">
                    <InputCheckbox
                        id="hasWater"
                        dataTestId="hasWater"
                        bind:value={hasWater}
                        onchange={() => {
                            if (hasWater && water.length === 0) regenerateWater();
                        }}
                    />
                    <label class="m-0 cursor-pointer" for="hasWater">{TT.water.enable()}</label>
                </div>
                {#if hasWater}
                    <Input
                        id="waterMargin"
                        dataTestId="waterMargin"
                        label={TT.water.margin()}
                        type="number"
                        min={0}
                        step={1}
                        bind:value={waterMargin}
                        onchange={() => regenerateWater()}
                    />
                    {#if water[0]}
                        <EntityRectangleInputs
                            bind:rectangle={water[0]}
                            maxWidth={frameWidth}
                            maxHeight={frameHeight}
                        />
                    {/if}
                {/if}
            </section>
        {/if}

        {#if isUploadForm}
            <section class="retro-card">
                <h4 class="retro-title">{TT.sections.options()}</h4>
                <div class="flex items-start gap-2">
                    <InputCheckbox id="floatingObject" dataTestId="floatingObject" bind:value={floatingObject} />
                    <label class="m-0 flex cursor-pointer flex-col" for="floatingObject">
                        <span>{TT.floatingObject()}</span>
                        <span class="retro-hint">{TT.floatingObjectDescription()}</span>
                    </label>
                </div>
                <div class="flex items-start gap-2">
                    <InputCheckbox id="animatedObject" dataTestId="animatedObject" bind:value={animated} />
                    <label class="m-0 flex cursor-pointer flex-col" for="animatedObject">
                        <span>{TT.animatedObject()}</span>
                        <span class="retro-hint">{TT.animatedObjectDescription()}</span>
                    </label>
                </div>
                {#if animated}
                    <div class="flex gap-2">
                        <Input
                            id="frameCount"
                            dataTestId="frameCount"
                            label={TT.frameCount()}
                            type="number"
                            min={2}
                            max={MAX_ENTITY_ANIMATION_FRAME_COUNT}
                            step={1}
                            bind:value={frameCount}
                        />
                        <Input
                            id="frameRate"
                            dataTestId="frameRate"
                            label={TT.frameRate()}
                            type="number"
                            min={1}
                            max={MAX_ENTITY_ANIMATION_FRAME_RATE}
                            bind:value={frameRate}
                        />
                    </div>
                {/if}
            </section>
        {/if}
    </div>

    <footer class="retro-footer">
        <div class="flex gap-2 w-full">
            <button type="button" class="retro-btn grow" onclick={closeForm}>
                {$LL.mapEditor.entityEditor.buttons.cancel()}
            </button>
            <button
                type="button"
                class="retro-btn retro-btn-primary grow"
                data-testid="applyEntityModifications"
                disabled={!canApply || saving}
                aria-busy={saving}
                onclick={save}
            >
                {#if saving}
                    <span class="retro-spinner" aria-hidden="true"></span>
                    {TT.saving()}
                {:else}
                    {isUploadForm
                        ? $LL.mapEditor.entityEditor.buttons.upload()
                        : $LL.mapEditor.entityEditor.buttons.save()}
                {/if}
            </button>
        </div>
        {#if profileOnly && resetProfile}
            <button
                type="button"
                class="retro-btn w-full"
                data-testid="resetEntityProfile"
                disabled={saving}
                onclick={() => runSaving(resetProfile)}
            >
                {TT.resetProfile()}
            </button>
        {/if}
        {#if !isUploadForm && !profileOnly}
            <button
                type="button"
                class="retro-btn retro-btn-danger w-full"
                data-testid="removeEntity"
                onclick={() => removeEntity({ entityId: customEntity.id })}
            >
                {$LL.mapEditor.entityEditor.buttons.delete()}
            </button>
        {/if}
    </footer>
</div>

<style>
    /* Layout of the form; colors, frames and controls come from the 16-bit theme (style/retro-theme.css). */
    .retro-form {
        width: 100%;
        max-height: calc(100dvh - 7rem);
    }

    .retro-header {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 16px 16px 10px;
    }

    .retro-subtitle {
        font-size: 13px;
        color: var(--rt-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .retro-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 4px 14px 12px;
    }

    .retro-preview {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px;
        background: var(--rt-bg-deep);
        border: 1px solid var(--rt-line);
        border-radius: var(--rt-radius-m);
    }

    .retro-preview :global(img),
    .retro-preview :global(canvas) {
        image-rendering: pixelated;
    }

    .retro-footer {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px 14px 16px;
        border-top: 1px solid var(--rt-line);
        background: var(--rt-bg-deep);
    }

    .checkerboard {
        padding: 6px;
        background-color: rgb(255 255 255 / 0.06);
        background-image:
            linear-gradient(45deg, rgb(255 255 255 / 0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgb(255 255 255 / 0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgb(255 255 255 / 0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgb(255 255 255 / 0.08) 75%);
        background-size: 12px 12px;
        background-position:
            0 0,
            0 6px,
            6px -6px,
            -6px 0;
    }
</style>
