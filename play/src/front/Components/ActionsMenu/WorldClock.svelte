<script lang="ts">
    import { sunHeightAt, WorldMoment } from "@wa/front/Phaser/Game/Night/WorldDaylight";
    import {
        NightMode,
        mapTimeZoneStore,
        nightModeStore,
        nightDateStore,
        worldCityStore,
        worldCustomMinutesStore,
        worldMomentStore,
        worldPointStore,
    } from "@wa/front/Stores/NightStore";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { worldClockTimeZone } from "../../Phaser/Game/Night/NightClock";

    /** The map of the world (Natural Earth, public domain): equirectangular, a point is read straight from it. */
    const WORLD_MAP = "/resources/terrain/world-map.png";
    const MAP_WIDTH = 240;
    const MAP_HEIGHT = 120;

    let open = $state(false);
    let root: HTMLDivElement | undefined = $state();

    let formatter = $derived(
        new Intl.DateTimeFormat($locale, {
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
            // The time of the place of the map (Paris without one), of the city of the world, or the computer's own.
            timeZone: worldClockTimeZone($nightModeStore === NightMode.Computer, $mapTimeZoneStore),
        }),
    );

    const modes = $derived([
        { value: NightMode.Server, label: $LL.menu.settings.night.server() },
        { value: NightMode.Computer, label: $LL.menu.settings.night.computer() },
        { value: NightMode.World, label: $LL.menu.settings.night.world() },
        { value: NightMode.Disabled, label: $LL.menu.settings.night.disabled() },
        { value: NightMode.Always, label: $LL.menu.settings.night.always() },
    ]);
    const moments = $derived([
        { value: WorldMoment.Morning, label: $LL.menu.settings.night.morning() },
        { value: WorldMoment.Noon, label: $LL.menu.settings.night.noon() },
        { value: WorldMoment.Evening, label: $LL.menu.settings.night.evening() },
        { value: WorldMoment.Custom, label: $LL.menu.settings.night.custom() },
    ]);

    let customTime = $derived(
        `${String(Math.floor($worldCustomMinutesStore / 60)).padStart(2, "0")}:${String(
            $worldCustomMinutesStore % 60,
        ).padStart(2, "0")}`,
    );

    function setCustomTime(value: string): void {
        const [hours, minutes] = value.split(":").map(Number);
        if (Number.isFinite(hours) && Number.isFinite(minutes)) worldCustomMinutesStore.set(hours * 60 + minutes);
    }

    let mapCanvas: HTMLCanvasElement | undefined = $state();
    let mapImage: HTMLImageElement | undefined = $state();

    // The map of the world, with the night where it is night now, and the place whose sky is shown.
    $effect(() => {
        const canvas = mapCanvas;
        const image = mapImage;
        const date = $nightDateStore;
        const city = $worldCityStore;
        const context = canvas?.getContext("2d");
        if (!canvas || !image?.complete || !context || !date) return;
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, MAP_WIDTH, MAP_HEIGHT);
        const shade = context.getImageData(0, 0, MAP_WIDTH, MAP_HEIGHT);
        for (let y = 0; y < MAP_HEIGHT; y++) {
            const latitude = 90 - ((y + 0.5) * 180) / MAP_HEIGHT;
            for (let x = 0; x < MAP_WIDTH; x++) {
                const height = sunHeightAt(date, latitude, ((x + 0.5) * 360) / MAP_WIDTH - 180);
                // Day: as it is; dusk: darker little by little; night: dark blue.
                const dark = height >= 0.1 ? 0 : height <= -0.1 ? 0.6 : (0.1 - height) * 3;
                const at = (y * MAP_WIDTH + x) * 4;
                shade.data[at] = shade.data[at] * (1 - dark) + 10 * dark;
                shade.data[at + 1] = shade.data[at + 1] * (1 - dark) + 20 * dark;
                shade.data[at + 2] = shade.data[at + 2] * (1 - dark) + 50 * dark;
            }
        }
        context.putImageData(shade, 0, 0);
        if (city) {
            const x = ((city.longitude + 180) * MAP_WIDTH) / 360;
            const y = ((90 - city.latitude) * MAP_HEIGHT) / 180;
            context.fillStyle = "#ffd34d";
            context.strokeStyle = "#1b1b1b";
            context.beginPath();
            context.arc(x, y, 3.5, 0, Math.PI * 2);
            context.fill();
            context.stroke();
        }
    });

    /** A click on the map: the latitude and the longitude of that point, read from its place on the map. */
    function pickPoint(event: MouseEvent): void {
        const box = (event.currentTarget as HTMLCanvasElement).getBoundingClientRect();
        const longitude = ((event.clientX - box.left) / box.width) * 360 - 180;
        const latitude = 90 - ((event.clientY - box.top) / box.height) * 180;
        worldPointStore.set({
            latitude: Math.max(-89, Math.min(89, latitude)),
            longitude: Math.max(-180, Math.min(180, longitude)),
        });
    }

    function chooseMoment(moment: WorldMoment): void {
        worldPointStore.set(undefined);
        worldMomentStore.set(moment);
    }

    // Closes on a click elsewhere or on Escape.
    $effect(() => {
        if (!open) return;
        const close = (event: Event): void => {
            if (event instanceof KeyboardEvent ? event.key === "Escape" : !root?.contains(event.target as Node)) {
                open = false;
            }
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", close);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", close);
        };
    });
</script>

{#if $nightDateStore}
    <div class="relative" bind:this={root}>
        <button
            type="button"
            class="rounded-full bg-contrast/80 px-3 py-1.5 text-xs tabular-nums backdrop-blur hover:bg-contrast"
            aria-haspopup="dialog"
            aria-expanded={open}
            title={$LL.menu.settings.night.skyMenu()}
            data-testid="world-clock-button"
            onclick={() => (open = !open)}
        >
            <time data-testid="world-clock" datetime={$nightDateStore.toISOString()}
                >{formatter.format($nightDateStore)}</time
            >
            {#if $worldCityStore}<span class="ms-1 opacity-70">{$worldCityStore.name}</span>{/if}
        </button>
        {#if open}
            <div
                role="dialog"
                aria-label={$LL.menu.settings.night.skyMenu()}
                data-testid="world-clock-menu"
                class="absolute end-0 top-full z-50 mt-2 w-64 rounded-lg bg-contrast/95 p-2 text-sm text-white shadow-lg backdrop-blur"
            >
                <div class="mb-1 px-1 text-xs font-bold opacity-70">{$LL.menu.settings.night.label()}</div>
                {#each modes as mode (mode.value)}
                    <button
                        type="button"
                        class="block w-full rounded px-2 py-1 text-start hover:bg-white/10 {$nightModeStore ===
                        mode.value
                            ? 'bg-white/15 font-bold'
                            : ''}"
                        aria-pressed={$nightModeStore === mode.value}
                        data-testid={`world-clock-mode-${mode.value}`}
                        onclick={() => nightModeStore.set(mode.value)}>{mode.label}</button
                    >
                {/each}
                {#if $nightModeStore === NightMode.World}
                    <div class="mt-2 border-t border-white/10 pt-2">
                        <p class="mb-1 px-1 text-xs opacity-70">{$LL.menu.settings.night.worldHelp()}</p>
                        <img
                            src={WORLD_MAP}
                            alt=""
                            class="hidden"
                            bind:this={mapImage}
                            onload={() => (mapImage = mapImage)}
                        />
                        <canvas
                            bind:this={mapCanvas}
                            width={MAP_WIDTH}
                            height={MAP_HEIGHT}
                            class="mb-2 w-full cursor-crosshair rounded [image-rendering:pixelated]"
                            data-testid="world-clock-map"
                            onclick={pickPoint}
                        ></canvas>
                        <div class="grid grid-cols-2 gap-1">
                            {#each moments as moment (moment.value)}
                                <button
                                    type="button"
                                    class="rounded px-2 py-1 hover:bg-white/10 {!$worldPointStore &&
                                    $worldMomentStore === moment.value
                                        ? 'bg-white/15 font-bold'
                                        : ''}"
                                    aria-pressed={!$worldPointStore && $worldMomentStore === moment.value}
                                    data-testid={`world-clock-moment-${moment.value}`}
                                    onclick={() => chooseMoment(moment.value)}>{moment.label}</button
                                >
                            {/each}
                        </div>
                        {#if !$worldPointStore && $worldMomentStore === WorldMoment.Custom}
                            <input
                                type="time"
                                class="mt-2 w-full rounded bg-white/10 px-2 py-1"
                                value={customTime}
                                data-testid="world-clock-custom-time"
                                onchange={(event) => setCustomTime(event.currentTarget.value)}
                            />
                        {/if}
                        {#if $worldCityStore}
                            <p class="mt-2 px-1 text-xs" data-testid="world-clock-city">
                                {$LL.menu.settings.night.worldCity({ city: $worldCityStore.name })}
                            </p>
                        {/if}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}
