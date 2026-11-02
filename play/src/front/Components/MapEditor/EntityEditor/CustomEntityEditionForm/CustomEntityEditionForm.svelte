<script lang="ts">
    import type { EntityAnimation, EntityPrefab } from "@workadventure/map-editor";
    import { MAX_ENTITY_ANIMATION_FRAME_COUNT, MAX_ENTITY_ANIMATION_FRAME_RATE } from "@workadventure/map-editor";
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
    import Button from "../../../UI/Button.svelte";
    import LogoCollisionGrid from "./LogoCollisionGrid.svg";
    import EntityEditionCollisionGrid from "./EntityEditionCollisionGrid.svelte";

    interface Props {
        customEntity: EntityPrefab;
        isUploadForm?: boolean;
        closeForm?: () => void;
        removeEntity?: (payload: { entityId: string }) => void;
        applyEntityModifications?: (entity: EntityPrefab) => void;
    }

    let {
        customEntity,
        isUploadForm = false,
        closeForm = () => {},
        removeEntity = () => {},
        applyEntityModifications = () => {},
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

    const depthOptions = {
        GROUND_LEVEL: "GroundLevel",
        STANDING: "Standing",
        CUSTOM: "Custom",
    } as const;

    type DepthOption = (typeof depthOptions)[keyof typeof depthOptions];

    let selectedDepthOption: DepthOption = $state(
        (() => (depthOffset === 0 ? depthOptions.STANDING : depthOptions.CUSTOM))(),
    );

    function getModifiedCustomEntity(): EntityPrefab {
        return {
            ...customEntity,
            name: name,
            tags: inputTagOptions !== undefined ? inputTagOptions.map((tagOption) => tagOption.value) : [],
            collisionGrid: floatingObject ? undefined : collisionGrid,
            depthOffset: depthOffset !== 0 ? -depthOffset : 0,
            animation,
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
        if (depthOption === depthOptions.STANDING) {
            depthOffset = 0;
        }
        if (depthOption === depthOptions.CUSTOM) {
            displayDepthCustomSelector = true;
        }
        if (depthOption === depthOptions.GROUND_LEVEL) {
            depthOffset = entityImageRef?.naturalHeight ?? 0;
        }
    }

    function getTranslationForDepthOption(depthOption: DepthOption) {
        if (depthOption === depthOptions.STANDING) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.standing();
        }
        if (depthOption === depthOptions.CUSTOM) {
            return $LL.mapEditor.entityEditor.customEntityEditorForm.custom();
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

<div class="flex flex-col flex-1 gap-2">
    <div class="self-center relative flex items-center">
        {#if !floatingObject}
            <EntityEditionCollisionGrid {collisionGrid} {updateCollisionGrid} collisionGridHeight={entityImageHeight} />
        {/if}
        <EntityImage
            classNames="w-32 max-h-32 object-contain"
            imageLoad={(image) => onImageLoad(image)}
            imageSource={customEntity.imagePath}
            imageAlt={customEntity.name}
            {animation}
            bind:displayedHeight={entityImageHeight}
        />
        {#if displayDepthCustomSelector}
            <div>
                <p class="m-0 p-0 text-xs">{$LL.mapEditor.entityEditor.customEntityEditorForm.wokaAbove()}</p>
                <div class="rotate-[270deg]" style="width: 30px;margin-top: {entityImageHeight - 30}px">
                    <input
                        class="!cursor-grab active:!cursor-grabbing slider"
                        style="width: {entityImageHeight}px"
                        bind:value={depthOffset}
                        type="range"
                        max={entityImageRef?.naturalHeight}
                    />
                </div>
                <p class="m-0 p-0 text-xs">{$LL.mapEditor.entityEditor.customEntityEditorForm.wokaBelow()}</p>
            </div>
        {/if}
    </div>
    {#if !floatingObject}
        <div>
            <img draggable="false" src={LogoCollisionGrid} alt="Logo collision grid" width="28px" />
            <p class="text-xs m-0 p-0">{$LL.mapEditor.entityEditor.customEntityEditorForm.collision()}</p>
        </div>
    {/if}
    <div>
        <label class="mb-2 block" for="id"><b>{$LL.mapEditor.entityEditor.customEntityEditorForm.imageName()}</b></label
        >
        <Input
            class="px-2 py-2.5 text-[16px] rounded-md bg-contrast border-solid border border-contrast-400 text-white min-w-full"
            bind:value={name}
            id="name"
            data-testid="name"
        />
    </div>
    <div>
        <label class="mb-2 block" for="tags"><b>{$LL.mapEditor.entityEditor.customEntityEditorForm.tags()}</b></label>
        <InputTags
            bind:value={inputTagOptions}
            placeholder={$LL.mapEditor.entityEditor.customEntityEditorForm.writeTag()}
        />
    </div>
    <div>
        <Select
            id="type"
            label={$LL.mapEditor.entityEditor.customEntityEditorForm.depth()}
            bind:value={selectedDepthOption}
        >
            {#each Object.values(depthOptions) as depthOption (depthOption)}
                <option value={depthOption}>{getTranslationForDepthOption(depthOption)}</option>
            {/each}
        </Select>
    </div>
    {#if isUploadForm}
        <div class="flex gap-2 mt-2 hover:cursor-pointer">
            <InputCheckbox id="floatingObject" dataTestId="floatingObject" bind:value={floatingObject} />
            <label class="my-[4px]" for="floatingObject"
                ><b class="-mb-2 block">{$LL.mapEditor.entityEditor.customEntityEditorForm.floatingObject()}</b>
                <br />
                {$LL.mapEditor.entityEditor.customEntityEditorForm.floatingObjectDescription()}
            </label>
        </div>
        <div class="flex gap-2 mt-2 hover:cursor-pointer">
            <InputCheckbox id="animatedObject" dataTestId="animatedObject" bind:value={animated} />
            <label class="my-[4px]" for="animatedObject"
                ><b class="-mb-2 block">{$LL.mapEditor.entityEditor.customEntityEditorForm.animatedObject()}</b>
                <br />
                {$LL.mapEditor.entityEditor.customEntityEditorForm.animatedObjectDescription()}
            </label>
        </div>
        {#if animated}
            <div class="flex gap-2">
                <Input
                    id="frameCount"
                    dataTestId="frameCount"
                    label={$LL.mapEditor.entityEditor.customEntityEditorForm.frameCount()}
                    type="number"
                    min={2}
                    max={MAX_ENTITY_ANIMATION_FRAME_COUNT}
                    step={1}
                    bind:value={frameCount}
                />
                <Input
                    id="frameRate"
                    dataTestId="frameRate"
                    label={$LL.mapEditor.entityEditor.customEntityEditorForm.frameRate()}
                    type="number"
                    min={1}
                    max={MAX_ENTITY_ANIMATION_FRAME_RATE}
                    bind:value={frameRate}
                />
            </div>
        {/if}
    {/if}
    <div class="flex gap-2 flex-wrap justify-center w-full text-sm">
        {#if !isUploadForm}
            <Button
                size="lg"
                variant="danger"
                class="w-full"
                dataTestId="removeEntity"
                onclick={() => removeEntity({ entityId: customEntity.id })}
            >
                {$LL.mapEditor.entityEditor.buttons.delete()}
            </Button>
        {/if}

        <div class="flex gap-2 w-full mt-2">
            <Button size="lg" variant="contrast" class="w-full" onclick={closeForm}>
                {$LL.mapEditor.entityEditor.buttons.cancel()}
            </Button>

            <Button
                size="lg"
                variant="secondary"
                class="w-full"
                dataTestId="applyEntityModifications"
                onclick={() => applyEntityModifications(getModifiedCustomEntity())}
            >
                {isUploadForm ? $LL.mapEditor.entityEditor.buttons.upload() : $LL.mapEditor.entityEditor.buttons.save()}
            </Button>
        </div>
    </div>
</div>

<style>
    .slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 5px;
        height: 40px;
        margin-top: -32px;
    }

    .slider::-moz-range-thumb {
        width: 5px;
        height: 40px;
        margin-top: -32px;
    }
</style>
