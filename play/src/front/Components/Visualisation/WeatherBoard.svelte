<script lang="ts">
    import { THAW_SPEED } from "@workadventure/map-editor";
    import type {
        AirOwner,
        Audience,
        FormExplained,
        ShownAir,
        WeatherBoard,
    } from "@wa/front/Phaser/Game/Weather/WeatherExplained";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { IconMap, IconUser, IconUsers } from "@wa-icons";

    /**
     * The "Weather explained" board: why this player sees the weather they see. It only shows what
     * WeatherExplained worked out from the rules of the game: no rule of the weather lives here.
     */
    interface Props {
        board: WeatherBoard;
    }
    let { board }: Props = $props();

    const tenths = $derived(new Intl.NumberFormat($locale, { maximumFractionDigits: 1 }));
    const whole = $derived(new Intl.NumberFormat($locale, { maximumFractionDigits: 0 }));
    const degrees = (value: number): string => `${tenths.format(value)} °C`;
    const percent = (value: number): string => `${whole.format(value)} %`;
    const kmh = (value: number): string => `${whole.format(value)} km/h`;
    const share = (value: number): string => whole.format(Math.round(value * 100));
    // A threshold is rounded away from the value of now, so that what is said holds once it is passed.
    const under = (value: number): string => degrees(Math.floor(value * 10 + 1e-6) / 10);
    const from = (value: number): string => degrees(Math.ceil(value * 10 - 1e-6) / 10);
    const degreesOr = (value: number | undefined): string =>
        value === undefined ? $LL.actionbar.visualisation.weather.airs.unknown() : degrees(value);

    const t = $derived($LL.actionbar.visualisation.weather);

    // The air of the map in blue, the player's own in yellow: on the airs at the top and on every card.
    const OWNER_PILL: Record<AirOwner, string> = {
        map: "bg-blue-500/50 ring-1 ring-blue-500",
        own: "bg-yellow-400/80 text-black",
    };
    const OWNER_EDGE: Record<AirOwner, string> = { map: "border-blue-500", own: "border-yellow-400" };

    function ownerName(owner: AirOwner): string {
        return owner === "map" ? t.decidedBy.map() : t.decidedBy.own();
    }
    function audienceName(audience: Audience): string {
        if (audience === "everyone") return t.seenBy.everyone();
        return audience === "you" ? t.seenBy.you() : t.seenBy.serverFollowers();
    }

    function airSource(air: ShownAir): string {
        return air.byHand ? t.airs.byHand() : t.airs.real({ place: air.place ?? t.airs.defaultPlace() });
    }

    /** Why a precipitation falls as it does, with the figures of its air. */
    function formWhy(form: FormExplained): string {
        const values = {
            temperature: degreesOr(form.temperature),
            humidity: form.humidity === undefined ? t.airs.unknown() : percent(form.humidity),
            wetBulb: degreesOr(form.wetBulb),
            snowUnder: degrees(form.snowUnderWetBulb),
            rainFrom: degrees(form.rainFromWetBulb),
        };
        switch (form.reason) {
            case "unknown":
                return t.form.unknown();
            case "wetBulbWarm":
                return t.form.wetBulbWarm(values);
            case "airMild":
                return t.form.airMild(values);
            case "wetBulbCold":
                return t.form.wetBulbCold(values);
            case "mix":
                return t.form.mix(values);
            case "mildMix":
                return t.form.mildMix(values);
        }
    }

    /** What it would take for a precipitation to fall otherwise; nothing when there is nothing simple to say. */
    function formChange(form: FormExplained): string[] {
        const lines: string[] = [];
        if (form.snowUnder !== undefined) {
            lines.push(
                form.snowUnderHumidity !== undefined
                    ? t.form.snowUnderOrDrier({
                          temperature: under(form.snowUnder),
                          humidity: percent(Math.floor(form.snowUnderHumidity)),
                      })
                    : t.form.snowUnder({ temperature: under(form.snowUnder) }),
            );
        }
        if (form.allSnowUnder !== undefined) lines.push(t.form.allSnowUnder({ temperature: under(form.allSnowUnder) }));
        if (form.rainFrom !== undefined) lines.push(t.form.rainFrom({ temperature: from(form.rainFrom) }));
        return lines;
    }

    const precipitationResult = $derived.by(() => {
        const { form, falling } = board.precipitation;
        const flakes = { share: share(board.precipitation.share) };
        if (form === "rain") return falling ? t.precipitation.rainFalling() : t.precipitation.rainIf();
        if (form === "snow") return falling ? t.precipitation.snowFalling() : t.precipitation.snowIf();
        return falling ? t.precipitation.mixFalling(flakes) : t.precipitation.mixIf(flakes);
    });

    const downpourResult = $derived.by(() => {
        const { form } = board.downpour;
        if (form === "rain") return t.downpour.rain();
        return form === "snow" ? t.downpour.snow() : t.downpour.mix({ share: share(board.downpour.share) });
    });

    const frostResult = $derived.by(() => {
        const { level, frost } = board.frost;
        if (level === "none") return t.frost.none();
        const strength = { percent: share(frost) };
        return level === "light" ? t.frost.light(strength) : t.frost.white(strength);
    });

    const frostWhy = $derived.by(() => {
        const frost = board.frost;
        const values = {
            temperature: degreesOr(frost.temperature),
            humidity: frost.humidity === undefined ? t.airs.unknown() : percent(frost.humidity),
            wind: frost.windSpeed === undefined ? t.airs.unknown() : kmh(frost.windSpeed),
            ground: degreesOr(frost.ground),
            frostPoint: degreesOr(frost.frostPoint),
        };
        switch (frost.reason) {
            case "unknown":
                return t.frost.unknown();
            case "noHumidity":
                return t.frost.noHumidity();
            case "groundWarm":
                return t.frost.groundWarm(values);
            case "wind":
                return t.frost.wind(values);
            case "dry":
                return frost.frostPoint === undefined ? t.frost.veryDry(values) : t.frost.dry(values);
            case "frost":
                return t.frost.frost(values);
        }
    });

    const frostChange = $derived.by(() => {
        const { needsHumidity, needsWindUnder, needsAirUnder } = board.frost;
        // More than this humidity, less than this wind: each rounded so that what is said holds.
        const humidity = needsHumidity === undefined ? undefined : percent(Math.min(100, Math.ceil(needsHumidity)));
        const wind = needsWindUnder === undefined ? undefined : kmh(Math.floor(needsWindUnder));
        if (wind !== undefined && humidity !== undefined) return t.frost.needsCalmOrHumidity({ wind, humidity });
        if (wind !== undefined) return t.frost.needsCalm({ wind });
        if (humidity !== undefined) return t.frost.needsHumidity({ humidity });
        return needsAirUnder === undefined ? undefined : t.frost.needsCold({ temperature: under(needsAirUnder) });
    });

    /** What is drawn lags behind the air: said once it differs by more than what the eye tells. */
    const lags = (drawn: number | undefined, target: number): boolean =>
        drawn !== undefined && Math.abs(drawn - target) > 0.05;

    const iceResult = $derived.by(() => {
        switch (board.ice.stage) {
            case "none":
                return t.ice.none();
            case "shallows":
                return t.ice.shallows();
            case "pools":
                return t.ice.pools();
            case "all":
                return t.ice.all();
        }
    });

    const iceWhy = $derived.by(() => {
        const temperature = { temperature: degreesOr(board.ice.temperature) };
        switch (board.ice.reason) {
            case "unknown":
                return t.ice.unknown();
            case "warm":
                return t.ice.warm(temperature);
            case "barely":
                return t.ice.barely(temperature);
            case "freezing":
                return t.ice.freezing(temperature);
        }
    });

    const soilResult = $derived.by(() => {
        const { reason, frost } = board.soil;
        if (reason === "frozen") return t.soil.frozen();
        return reason === "partly" ? t.soil.partly({ percent: share(frost) }) : t.soil.thawed();
    });

    const soilWhy = $derived.by(() => {
        const soil = board.soil;
        const values = {
            temperature: degreesOr(soil.temperature),
            thawedFrom: degrees(soil.thawedFrom),
            frozenUnder: degrees(soil.frozenUnder),
        };
        switch (soil.reason) {
            case "unknown":
                return t.soil.unknownWhy();
            case "thawed":
                return t.soil.thawedWhy(values);
            case "partly":
                return t.soil.partlyWhy(values);
            case "frozen":
                return t.soil.frozenWhy(values);
        }
    });

    const snowResult = $derived.by(() => {
        const snow = board.snow;
        if (!snow.known) return t.snow.unknown();
        if (snow.mapCover <= 0) return t.snow.none();
        // A thin snow somewhere is not "0 %": at least 1 % once any lies.
        return t.snow.some({
            map: whole.format(Math.max(1, Math.round(snow.mapCover * 100))),
            here: share(snow.hereCover),
        });
    });

    const snowTrend = $derived.by(() => {
        const snow = board.snow;
        const temperature = degreesOr(snow.temperature);
        switch (snow.trend) {
            case "none":
                return undefined;
            case "building":
                return t.snow.building({ share: share(snow.snowShare) });
            case "holding":
                return t.snow.holding({ temperature });
            case "unknown":
                return t.snow.unknownAir();
            case "melting": {
                const seconds = snow.whiteGroundMeltsIn ?? 0;
                const duration =
                    seconds < 90
                        ? t.snow.seconds({ value: whole.format(Math.max(1, Math.round(seconds))) })
                        : t.snow.minutes({ value: whole.format(Math.round(seconds / 60)) });
                return t.snow.melting({ temperature, duration });
            }
        }
    });

    const cards = $derived([
        {
            id: "precipitation",
            title: t.precipitation.title(),
            owner: board.precipitation.air,
            audience: board.precipitation.audience,
            result: precipitationResult,
            why: [formWhy(board.precipitation)],
            change: formChange(board.precipitation),
            notes: board.precipitation.air === "own" ? [t.precipitation.ownOnly()] : [],
            more: t.form.more(),
        },
        {
            id: "downpour",
            title: t.downpour.title(),
            owner: board.downpour.air,
            audience: board.downpour.audience,
            result: downpourResult,
            why: [
                formWhy(board.downpour),
                board.follows === "server" || board.city === undefined
                    ? t.downpour.always()
                    : `${t.downpour.always()} ${t.downpour.notYours({ city: board.city })}`,
            ],
            change: formChange(board.downpour),
            notes: [],
            more: t.form.more(),
        },
        {
            id: "frost",
            title: t.frost.title(),
            owner: board.frost.air,
            audience: board.frost.audience,
            result: frostResult,
            why: [frostWhy],
            change: frostChange === undefined ? [] : [frostChange],
            notes: lags(board.frost.drawn, board.frost.frost)
                ? [t.frost.drawn({ percent: share(board.frost.drawn ?? 0) })]
                : [],
            more: t.frost.more(),
        },
        {
            id: "ice",
            title: t.ice.title(),
            owner: board.ice.air,
            audience: board.ice.audience,
            result: iceResult,
            why: [iceWhy],
            change: [
                t.ice.ladder({
                    shallows: under(board.ice.thresholds.shallows),
                    pools: under(board.ice.thresholds.pools),
                    all: under(board.ice.thresholds.all),
                }),
            ],
            notes: lags(board.ice.drawn, board.ice.ice) ? [t.ice.drawn()] : [],
            more: t.ice.more(),
        },
        {
            id: "soil",
            title: t.soil.title(),
            owner: board.soil.air,
            audience: board.soil.audience,
            result: soilResult,
            why: [soilWhy, t.soil.effect()],
            change: [],
            notes: [],
            more: t.soil.honest(),
        },
        {
            id: "snow",
            title: t.snow.title(),
            owner: board.snow.air,
            audience: board.snow.audience,
            result: snowResult,
            why: snowTrend === undefined ? [] : [snowTrend],
            change: [],
            notes:
                !board.snow.shown && board.city !== undefined
                    ? [t.snow.hidden({ city: board.city }), t.snow.water()]
                    : [t.snow.water()],
            more: t.snow.honest({ times: whole.format(THAW_SPEED) }),
        },
    ]);
</script>

{#snippet airBox(owner: AirOwner, air: ShownAir, name: string, hint: string)}
    <div
        class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border-0 border-s-4 border-solid bg-white/10 p-2 {OWNER_EDGE[
            owner
        ]}"
        data-testid="weather-board-air-{owner}"
    >
        <div class="font-bold">{name}</div>
        <div class="opacity-70">{hint} · {airSource(air)}</div>
        <dl class="m-0 mt-1 grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
            <dt class="opacity-80">{t.airs.temperature()}</dt>
            <dd class="m-0 text-end font-bold tabular-nums">
                {air.temperature === undefined ? t.airs.unknown() : degrees(air.temperature)}
            </dd>
            <dt class="opacity-80">{t.airs.humidity()}</dt>
            <dd class="m-0 text-end font-bold tabular-nums">
                {air.humidity === undefined ? t.airs.unknown() : percent(air.humidity)}
            </dd>
            <dt class="opacity-80">{t.airs.wind()}</dt>
            <dd class="m-0 text-end font-bold tabular-nums">
                {air.windSpeed === undefined ? t.airs.unknown() : kmh(air.windSpeed)}
            </dd>
        </dl>
    </div>
{/snippet}

<section
    class="flex max-h-[60vh] w-[26rem] max-w-[calc(100vw-1.5rem)] flex-col gap-2 overflow-y-auto rounded-xl bg-contrast/80 p-2 text-xs backdrop-blur"
    aria-label={t.title()}
    data-testid="weather-board"
>
    <header>
        <h2 class="m-0 text-sm font-bold">{t.title()}</h2>
        <p class="m-0 opacity-80">{t.intro()}</p>
    </header>

    <div class="flex flex-wrap gap-2">
        {@render airBox("map", board.mapAir, t.airs.map(), t.airs.mapHint())}
        {#if board.ownAir}
            {@render airBox("own", board.ownAir, t.airs.own(), t.airs.ownHint())}
        {/if}
    </div>
    <p class="m-0 opacity-70" data-testid="weather-board-units">{t.airs.units()}</p>
    <p class="m-0 font-bold" data-testid="weather-board-follows">
        {#if board.follows === "server" || board.city === undefined}
            {t.airs.followsServer()}
        {:else if board.follows === "city"}
            {t.airs.followsCity({ city: board.city })}
        {:else}
            {t.airs.followsTrial({ city: board.city })}
        {/if}
    </p>

    {#each cards as card (card.id)}
        <article
            class="flex flex-col gap-1 rounded-lg border-0 border-s-4 border-solid bg-white/10 p-2 {OWNER_EDGE[
                card.owner
            ]}"
            data-testid="weather-board-{card.id}"
        >
            <h3 class="m-0 text-xs font-bold uppercase tracking-wide opacity-80">{card.title}</h3>
            <p class="m-0 text-sm font-bold" data-testid="weather-board-{card.id}-result">{card.result}</p>
            <div class="flex flex-wrap gap-1">
                <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 {OWNER_PILL[card.owner]}"
                    data-testid="weather-board-{card.id}-air"
                    data-air={card.owner}
                >
                    {#if card.owner === "map"}<IconMap width="12" height="12" />{:else}<IconUser
                            width="12"
                            height="12"
                        />{/if}
                    <span>{t.decidedBy.label()} <b>{ownerName(card.owner)}</b></span>
                </span>
                <span
                    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-white/50"
                    data-testid="weather-board-{card.id}-audience"
                    data-audience={card.audience}
                >
                    {#if card.audience === "you"}<IconUser width="12" height="12" />{:else}<IconUsers
                            width="12"
                            height="12"
                        />{/if}
                    <span>{t.seenBy.label()} <b>{audienceName(card.audience)}</b></span>
                </span>
            </div>
            {#each card.why as line (line)}
                <p class="m-0">{line}</p>
            {/each}
            {#each card.change as line (line)}
                <p class="m-0 opacity-80" data-testid="weather-board-{card.id}-change">→ {line}</p>
            {/each}
            {#each card.notes as line (line)}
                <p class="m-0 opacity-80">{line}</p>
            {/each}
            <details>
                <summary class="cursor-pointer opacity-70 hover:opacity-100">{t.more()}</summary>
                <p class="m-0 mt-1 opacity-80">{card.more}</p>
            </details>
        </article>
    {/each}

    <footer class="flex flex-col gap-0.5 opacity-70">
        <span>{t.airs.source()}</span>
        <span>{t.airs.whereMap()}</span>
        <span>{t.airs.whereOwn()}</span>
    </footer>
</section>
