<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import type { VehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { Vehicle, readVehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { createVehicleSheet, drawVehiclePreview } from "@wa/front/Phaser/Vehicle/VehicleAssets";
    import {
        drawSwimwearFrame,
        loadSwimwearAssets,
        resolveSwimwear,
        sampleAvatarSkinTone,
    } from "@wa/front/Phaser/Entity/Swimwear";
    import type { Swimwear, SwimwearAssets } from "@wa/front/Phaser/Entity/Swimwear";
    import type { WokaData, WokaTexture } from "./WokaTypes";

    interface Props {
        selectedTextures: Record<string, string>;
        wokaData?: WokaData | null;
        canvasSize?: number;
        direction?: number;
        getTextureUrl?: (url: string) => string;
        classList?: string;
        swimwear?: Swimwear;
        swimwearColor?: string;
        vehicle?: Vehicle;
        vehicleColors?: VehicleColors;
    }

    let {
        selectedTextures,
        wokaData = null,
        canvasSize = 64,
        direction = 0,
        getTextureUrl = (url) => url,
        classList = "",
        swimwear,
        swimwearColor,
        vehicle,
        vehicleColors = readVehicleColors(null),
    }: Props = $props();

    let vehicleCanvas: HTMLCanvasElement | undefined;
    $effect(() => {
        if (vehicle !== Vehicle.Skateboard) return;
        vehicleCanvas = createVehicleSheet(vehicleColors);
        return () => {
            vehicleCanvas = undefined;
        };
    });

    const bodyPartOrder = ["body", "eyes", "hair", "clothes", "hat", "accessory", "woka"];

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    let images: Record<string, HTMLImageElement> = {};
    let frame: number = 0;

    let raf: number;
    let outfitCanvas: HTMLCanvasElement;
    let outfitContext: CanvasRenderingContext2D | null = null;
    let swimwearAssets = $state<SwimwearAssets | undefined>();
    $effect(() => {
        if (swimwear === undefined) return;
        let active = true;
        loadSwimwearAssets()
            .then((assets) => {
                if (active) swimwearAssets = assets;
            })
            .catch((error: unknown) => console.error("Could not preview swimwear", error));
        return () => {
            active = false;
        };
    });

    function findTextureUrl(bodyPart: string): string | null {
        const textureId = selectedTextures?.[bodyPart];
        if (!textureId || !wokaData?.[bodyPart]?.collections) return null;
        for (const collection of wokaData[bodyPart].collections) {
            const texture = collection.textures.find((t: WokaTexture) => t.id === textureId);
            if (texture) return getTextureUrl(texture.url);
        }
        return null;
    }

    function loadImages() {
        images = {};
        for (const part of bodyPartOrder) {
            const url = findTextureUrl(part);
            if (url) {
                const img = new window.Image();
                // Load image with CORS headers to populate the cache with CORS headers
                img.crossOrigin = "user-credentials";
                img.src = url;
                images[part] = img;
            }
        }
    }

    function draw() {
        if (vehicle === Vehicle.Skateboard && vehicleCanvas) {
            const layers = bodyPartOrder.flatMap((part) =>
                images[part] ? [{ image: images[part], head: ["hair", "hat", "eyes"].includes(part) }] : [],
            );
            drawVehiclePreview(ctx, vehicleCanvas, layers, direction, canvasSize);
            return;
        }
        const imageFrame = swimwear === undefined ? frame : 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (const part of bodyPartOrder) {
            const img = images[part];
            ctx.imageSmoothingEnabled = false;
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, imageFrame * 32, direction * 32, 32, 32, 0, 0, canvasSize, canvasSize);
            }
        }
        if (swimwear === undefined || !outfitContext || !swimwearAssets) return;
        const frameContext = outfitContext;
        frameContext.clearRect(0, 0, 32, 32);
        for (const part of bodyPartOrder.filter((part) => part !== "clothes" && part !== "accessory")) {
            const img = images[part];
            if (img?.complete && img.naturalWidth > 0)
                frameContext.drawImage(img, imageFrame * 32, 0, 32, 32, 0, 0, 32, 32);
        }
        try {
            const skinTone = sampleAvatarSkinTone(frameContext);
            frameContext.clearRect(0, 0, 32, 32);
            for (const part of bodyPartOrder.filter((part) => part !== "clothes" && part !== "accessory")) {
                const img = images[part];
                if (img?.complete && img.naturalWidth > 0)
                    frameContext.drawImage(img, imageFrame * 32, direction * 32, 32, 32, 0, 0, 32, 32);
            }
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.scale(canvasSize / 32, canvasSize / 32);
            drawSwimwearFrame(
                ctx,
                outfitCanvas,
                swimwearAssets,
                resolveSwimwear(swimwear, Object.values(selectedTextures)),
                direction * 3 + imageFrame,
                skinTone,
                swimwearColor,
            );
            ctx.restore();
            for (const part of ["hair", "hat"]) {
                const img = images[part];
                if (img?.complete && img.naturalWidth > 0)
                    ctx.drawImage(
                        img,
                        imageFrame * 32,
                        direction * 32 + 20,
                        32,
                        12,
                        0,
                        (20 / 32) * canvasSize,
                        canvasSize,
                        (12 / 32) * canvasSize,
                    );
            }
        } catch (error) {
            if (!(error instanceof DOMException) || error.name !== "SecurityError") throw error;
        }
    }

    function animate() {
        draw();
        raf = requestAnimationFrame(animate);
    }

    $effect(() => {
        if (selectedTextures) {
            loadImages();
        }
    });

    onMount(() => {
        const context = canvas.getContext("2d");
        if (!context) return;
        ctx = context;
        outfitCanvas = document.createElement("canvas");
        outfitCanvas.width = 32;
        outfitCanvas.height = 32;
        outfitContext = outfitCanvas.getContext("2d");
        if (outfitContext) outfitContext.imageSmoothingEnabled = false;
        loadImages();
        animate();
    });
    onDestroy(() => {
        cancelAnimationFrame(raf);
    });
</script>

<canvas bind:this={canvas} width={canvasSize} height={canvasSize} style="image-rendering: pixelated;" class={classList}
></canvas>
