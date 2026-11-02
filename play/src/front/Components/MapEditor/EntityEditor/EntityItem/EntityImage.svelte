<script lang="ts">
    import type { EntityAnimation } from "@workadventure/map-editor";
    import { IconLoader, IconPhotoOff } from "@wa-icons";

    interface Props {
        classNames?: string;
        imageSource: string;
        imageAlt: string;
        imageLoad?: (image: HTMLImageElement) => void;
        /** When set, the image is a strip of frames, played in a loop on a canvas the size of one frame. */
        animation?: EntityAnimation;
        /** Height of the displayed image or frame, in CSS pixels. */
        displayedHeight?: number;
    }

    let {
        classNames = undefined,
        imageSource,
        imageAlt,
        imageLoad = () => {},
        animation = undefined,
        displayedHeight = $bindable(0),
    }: Props = $props();
    let imageElementRef: HTMLImageElement;
    let canvasElementRef: HTMLCanvasElement | undefined = $state();
    let loadedImage: HTMLImageElement | undefined = $state();
    let imageHeight = $state(0);
    let canvasHeight = $state(0);
    let imageRetry = $state(false);
    let imageError = $state(false);
    let MAX_RETRY = 10;
    let retry = 0;

    function retryImageLoading() {
        imageRetry = true;
        if (retry <= MAX_RETRY) {
            setTimeout(() => {
                imageElementRef.src = imageSource;
                retry += 1;
            }, 500);
        } else {
            imageRetry = false;
            imageError = true;
        }
    }

    $effect(() => {
        displayedHeight = animation ? canvasHeight : imageHeight;
    });

    $effect(() => {
        const canvas = canvasElementRef;
        const image = loadedImage;
        if (!animation || !canvas || !image) return;
        const { frameCount, frameRate } = animation;
        const frameWidth = Math.floor(image.naturalWidth / frameCount);
        const frameHeight = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (frameWidth < 1 || !context) return;
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        let frame = 0;
        const drawFrame = () => {
            context.clearRect(0, 0, frameWidth, frameHeight);
            context.drawImage(image, frame * frameWidth, 0, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
            frame = (frame + 1) % frameCount;
        };
        drawFrame();
        const interval = setInterval(drawFrame, 1000 / frameRate);
        return () => clearInterval(interval);
    });
</script>

{#if imageRetry}
    <div class="flex items-center justify-center flex-1" data-testid="entityImageLoader">
        <IconLoader class="animate-spin" />
    </div>
{/if}

{#if imageError}
    <div class="flex items-center justify-center flex-1" data-testid="entityImageError">
        <IconPhotoOff />
    </div>
{/if}

{#if animation}
    <canvas
        class={`${classNames} ${imageRetry || imageError || !loadedImage ? "invisible flex-[0_1_0]" : "visible"}`}
        style="image-rendering: pixelated"
        aria-label={imageAlt}
        bind:this={canvasElementRef}
        bind:clientHeight={canvasHeight}
    ></canvas>
{/if}

<img
    loading={animation ? "eager" : "lazy"}
    draggable="false"
    class={`${classNames} ${animation ? "hidden" : imageRetry || imageError ? "invisible flex-[0_1_0]" : "visible"}`}
    style="image-rendering: pixelated"
    src={imageSource}
    alt={imageAlt}
    onload={() => {
        loadedImage = imageElementRef;
        imageLoad(imageElementRef);
        imageError = false;
        imageRetry = false;
    }}
    bind:this={imageElementRef}
    bind:clientHeight={imageHeight}
    onerror={() => retryImageLoading()}
/>
