<script lang="ts">
    import {
        DEFAULT_FIRE_THRESHOLDS,
        FIRE_CONDITION_BOUNDS,
        FIRE_THRESHOLD_BOUNDS,
        fireDanger,
        fireDangerLevel,
        NEUTRAL_FIRE_CONDITIONS,
    } from "@workadventure/map-editor";
    import type { SetFireConditionsMessage } from "@workadventure/messages";
    import { onDestroy } from "svelte";
    import { LL } from "../../../i18n/i18n-svelte";
    import { COMPASS_POINTS, compassPointOf } from "../../Phaser/Game/Weather/WindDirection";
    import { fireConditionsStore } from "../../Stores/FireConditionsStore";
    import { sendFireConditions } from "./fireConditionsActions";

    /** A slider being dragged asks the server this often at most; its last value is always sent. */
    const SEND_EVERY_MS = 250;
    const DANGER_NAMES = ["low", "moderate", "high", "extreme"] as const;
    const DANGER_COLOURS = ["text-white/70", "text-yellow-300", "text-orange-400", "text-red-400"];

    // What the sliders show: what the server last told, until this person moves one.
    let shown = $state<SetFireConditionsMessage>({
        manual: false,
        ...NEUTRAL_FIRE_CONDITIONS,
        thresholdTemperature: DEFAULT_FIRE_THRESHOLDS.temperature,
        thresholdHumidity: DEFAULT_FIRE_THRESHOLDS.humidity,
        thresholdWindSpeed: DEFAULT_FIRE_THRESHOLDS.windSpeed,
    });
    // An announcement of the server moves the sliders and sends nothing back: no echo between two players.
    $effect(() => {
        if ($fireConditionsStore) shown = { ...$fireConditionsStore };
    });

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSentAt = -Infinity;
    function send(): void {
        clearTimeout(timer);
        const wait = lastSentAt + SEND_EVERY_MS - Date.now();
        if (wait > 0) {
            timer = setTimeout(send, wait);
            return;
        }
        lastSentAt = Date.now();
        sendFireConditions({ ...shown });
    }
    onDestroy(() => clearTimeout(timer));

    function change(field: keyof Omit<SetFireConditionsMessage, "manual">, value: number): void {
        shown = { ...shown, [field]: value };
        send();
    }
    function setManual(manual: boolean): void {
        shown = { ...shown, manual };
        send();
    }

    const windPoint = $derived(compassPointOf(shown.windFrom) ?? "n");
    const danger = $derived(
        fireDangerLevel(
            fireDanger(shown, {
                temperature: shown.thresholdTemperature,
                humidity: shown.thresholdHumidity,
                windSpeed: shown.thresholdWindSpeed,
            }),
        ),
    );

    const conditionRows = $derived([
        {
            field: "temperature" as const,
            label: $LL.actionbar.catastrophe.weather.temperature(),
            bounds: FIRE_CONDITION_BOUNDS.temperature,
            value: $LL.actionbar.catastrophe.weather.temperatureValue({ value: Math.round(shown.temperature) }),
        },
        {
            field: "humidity" as const,
            label: $LL.actionbar.catastrophe.weather.humidity(),
            bounds: FIRE_CONDITION_BOUNDS.humidity,
            value: $LL.actionbar.catastrophe.weather.humidityValue({ value: Math.round(shown.humidity) }),
        },
        {
            field: "windSpeed" as const,
            label: $LL.actionbar.catastrophe.weather.wind(),
            bounds: FIRE_CONDITION_BOUNDS.windSpeed,
            value: $LL.actionbar.catastrophe.weather.windValue({ value: Math.round(shown.windSpeed) }),
        },
    ]);
    const thresholdRows = $derived([
        {
            field: "thresholdTemperature" as const,
            label: $LL.actionbar.catastrophe.weather.thresholdTemperature(),
            bounds: FIRE_THRESHOLD_BOUNDS.temperature,
            value: $LL.actionbar.catastrophe.weather.temperatureValue({
                value: Math.round(shown.thresholdTemperature),
            }),
        },
        {
            field: "thresholdHumidity" as const,
            label: $LL.actionbar.catastrophe.weather.thresholdHumidity(),
            bounds: FIRE_THRESHOLD_BOUNDS.humidity,
            value: $LL.actionbar.catastrophe.weather.humidityValue({ value: Math.round(shown.thresholdHumidity) }),
        },
        {
            field: "thresholdWindSpeed" as const,
            label: $LL.actionbar.catastrophe.weather.thresholdWind(),
            bounds: FIRE_THRESHOLD_BOUNDS.windSpeed,
            value: $LL.actionbar.catastrophe.weather.windValue({ value: Math.round(shown.thresholdWindSpeed) }),
        },
    ]);
</script>

<div class="flex flex-col gap-2" data-testid="catastrophe-weather">
    <label class="flex items-center gap-2">
        <input
            type="checkbox"
            checked={shown.manual}
            data-testid="fire-manual"
            onchange={(event) => setManual(event.currentTarget.checked)}
        />
        <span>{$LL.actionbar.catastrophe.weather.manual()}</span>
        <span class="ms-auto {DANGER_COLOURS[danger]}" data-testid="fire-danger">
            {$LL.actionbar.catastrophe.weather.danger()} :
            {$LL.actionbar.catastrophe.weather.dangerLevel[DANGER_NAMES[danger]]()}
        </span>
    </label>
    {#if !shown.manual}
        <p class="m-0 max-w-xs text-white/60">{$LL.actionbar.catastrophe.weather.realHint()}</p>
    {/if}
    {#each conditionRows as row (row.field)}
        <label class="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2 {shown.manual ? '' : 'opacity-60'}">
            <span>{row.label}</span>
            <input
                type="range"
                min={row.bounds[0]}
                max={row.bounds[1]}
                step="1"
                value={shown[row.field]}
                disabled={!shown.manual}
                data-testid="fire-{row.field}"
                oninput={(event) => change(row.field, Number(event.currentTarget.value))}
            />
            <span class="whitespace-nowrap text-end tabular-nums">{row.value}</span>
        </label>
    {/each}
    <label class="grid grid-cols-[7rem_1fr] items-center gap-2 {shown.manual ? '' : 'opacity-60'}">
        <span>{$LL.actionbar.catastrophe.weather.windFrom()}</span>
        <select
            class="rounded bg-white/10 px-1 py-0.5"
            value={windPoint}
            disabled={!shown.manual}
            data-testid="fire-windFrom"
            onchange={(event) =>
                change("windFrom", COMPASS_POINTS.findIndex((point) => point === event.currentTarget.value) * 45)}
        >
            {#each COMPASS_POINTS as point (point)}
                <option value={point}>{$LL.actionbar.weatherBanner.windPoint[point]()}</option>
            {/each}
        </select>
    </label>
    <span class="mt-1 text-white/60">{$LL.actionbar.catastrophe.weather.thresholds()}</span>
    {#each thresholdRows as row (row.field)}
        <label class="grid grid-cols-[7rem_1fr_4.5rem] items-center gap-2">
            <span>{row.label}</span>
            <input
                type="range"
                min={row.bounds[0]}
                max={row.bounds[1]}
                step="1"
                value={shown[row.field]}
                data-testid="fire-{row.field}"
                oninput={(event) => change(row.field, Number(event.currentTarget.value))}
            />
            <span class="whitespace-nowrap text-end tabular-nums">{row.value}</span>
        </label>
    {/each}
</div>
