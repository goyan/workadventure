<script lang="ts">
    import { Vehicle, readVehicleColors, type VehicleColors } from "@wa/front/Phaser/Vehicle/Vehicle";
    import { loadAirplaneArtwork } from "@wa/front/Phaser/Vehicle/AirplaneArtwork";
    import { createVehicleSheet } from "@wa/front/Phaser/Vehicle/VehicleAssets";
    import { VEHICLE_FRAME_SIZE } from "@wa/front/Phaser/Vehicle/VehicleFrames";

    interface Props {
        vehicle: Vehicle;
        colors?: VehicleColors;
        size?: number;
    }

    let { vehicle, colors, size = 28 }: Props = $props();
    let shownColors = $derived(colors ?? readVehicleColors(null, vehicle));
    let canvas = $state<HTMLCanvasElement>();

    $effect(() => {
        const context = canvas?.getContext("2d");
        if (!context || vehicle === Vehicle.None) return;
        const selected = vehicle;
        const paint = shownColors;
        let active = true;
        const draw = (): void => {
            if (!active) return;
            const sheet = createVehicleSheet(paint, selected);
            context.clearRect(0, 0, VEHICLE_FRAME_SIZE, VEHICLE_FRAME_SIZE);
            context.imageSmoothingEnabled = false;
            const frame = document.createElement("canvas");
            frame.width = frame.height = VEHICLE_FRAME_SIZE;
            const frameContext = frame.getContext("2d");
            if (!frameContext) return;
            const heading = selected === Vehicle.Airplane ? 0 : 2;
            frameContext.drawImage(
                sheet,
                heading * VEHICLE_FRAME_SIZE,
                0,
                VEHICLE_FRAME_SIZE,
                VEHICLE_FRAME_SIZE,
                0,
                0,
                VEHICLE_FRAME_SIZE,
                VEHICLE_FRAME_SIZE,
            );
            const pixels = frameContext.getImageData(0, 0, VEHICLE_FRAME_SIZE, VEHICLE_FRAME_SIZE).data;
            let left = VEHICLE_FRAME_SIZE;
            let top = VEHICLE_FRAME_SIZE;
            let right = -1;
            let bottom = -1;
            for (let y = 0; y < VEHICLE_FRAME_SIZE; y++) {
                for (let x = 0; x < VEHICLE_FRAME_SIZE; x++) {
                    if (pixels[(y * VEHICLE_FRAME_SIZE + x) * 4 + 3] === 0) continue;
                    left = Math.min(left, x);
                    top = Math.min(top, y);
                    right = Math.max(right, x);
                    bottom = Math.max(bottom, y);
                }
            }
            if (right < left) return;
            const width = right - left + 1;
            const height = bottom - top + 1;
            const scale = (VEHICLE_FRAME_SIZE - 8) / Math.max(width, height);
            context.drawImage(
                frame,
                left,
                top,
                width,
                height,
                (VEHICLE_FRAME_SIZE - width * scale) / 2,
                (VEHICLE_FRAME_SIZE - height * scale) / 2,
                width * scale,
                height * scale,
            );
        };
        if (selected === Vehicle.Airplane) {
            loadAirplaneArtwork()
                .then(draw)
                .catch((error: unknown) => console.error("Could not draw airplane icon", error));
        } else {
            draw();
        }
        return () => {
            active = false;
        };
    });
</script>

<canvas
    bind:this={canvas}
    width={VEHICLE_FRAME_SIZE}
    height={VEHICLE_FRAME_SIZE}
    class="shrink-0"
    style={`image-rendering: pixelated; width: ${size}px; height: ${size}px;`}
    aria-hidden="true"
></canvas>
