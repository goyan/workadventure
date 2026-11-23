<script lang="ts">
    import type {
        AirOwner,
        Audience,
        FormExplained,
        ShownAir,
        WeatherBoard,
    } from "@wa/front/Phaser/Game/Weather/WeatherExplained";
    import { LL, locale } from "../../../i18n/i18n-svelte";
    import { fastWaterStore } from "../../Stores/FastWaterStore";
    import { coverClockLine, coverFigures, iceTrendLine, snowTrendLine } from "./coverText";
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
    const figures = $derived(coverFigures(t, $locale));

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

    type Precipitation = WeatherBoard["precipitation"];
    type Frost = WeatherBoard["frost"];
    type Ice = WeatherBoard["ice"];

    function precipitationResult({ form, falling, share: flakes }: Omit<Precipitation, "differs">): string {
        const values = { share: share(flakes) };
        if (form === "rain") return falling ? t.precipitation.rainFalling() : t.precipitation.rainIf();
        if (form === "snow") return falling ? t.precipitation.snowFalling() : t.precipitation.snowIf();
        return falling ? t.precipitation.mixFalling(values) : t.precipitation.mixIf(values);
    }

    /** A precipitation in a few words, for the summary and the gap. */
    function precipitationShort({ form, falling }: Omit<Precipitation, "differs">): string {
        const short = t.compare.short;
        if (form === "rain") return falling ? short.rain() : short.dryRain();
        if (form === "snow") return falling ? short.snow() : short.drySnow();
        return falling ? short.mix() : short.dryMix();
    }

    const downpourResult = $derived.by(() => {
        const { form } = board.downpour;
        if (form === "rain") return t.downpour.rain();
        return form === "snow" ? t.downpour.snow() : t.downpour.mix({ share: share(board.downpour.share) });
    });

    function frostResult({ level, frost }: Omit<Frost, "differs">): string {
        if (level === "none") return t.frost.none();
        const strength = { percent: share(frost) };
        return level === "light" ? t.frost.light(strength) : t.frost.white(strength);
    }

    function frostShort({ level }: Omit<Frost, "differs">): string {
        const short = t.compare.short;
        if (level === "none") return short.noFrost();
        return level === "light" ? short.lightFrost() : short.whiteFrost();
    }

    function frostWhy(frost: Omit<Frost, "differs">): string {
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
    }

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

    function iceResult({ stage }: Omit<Ice, "differs">): string {
        switch (stage) {
            case "none":
                return t.ice.none();
            case "shallows":
                return t.ice.shallows();
            case "pools":
                return t.ice.pools();
            case "all":
                return t.ice.all();
        }
    }

    function iceShort({ stage }: Omit<Ice, "differs">): string {
        const short = t.compare.short;
        switch (stage) {
            case "none":
                return short.noIce();
            case "shallows":
                return short.shallows();
            case "pools":
                return short.pools();
            case "all":
                return short.allIce();
        }
    }

    function iceWhy(ice: Omit<Ice, "differs">): string {
        const temperature = { temperature: degreesOr(ice.temperature) };
        switch (ice.reason) {
            case "unknown":
                return t.ice.unknown();
            case "warm":
                return t.ice.warm(temperature);
            case "barely":
                return t.ice.barely(temperature);
            case "freezing":
                return t.ice.freezing(temperature);
        }
    }

    const soilResult = $derived.by(() => {
        const { reason, frost } = board.soil;
        if (reason === "frozen") return t.soil.frozen();
        return reason === "partly" ? t.soil.partly({ percent: share(frost) }) : t.soil.thawed();
    });

    const soilShort = $derived.by(() => {
        const short = t.compare.short;
        if (board.soil.reason === "frozen") return short.soilFrozen();
        return board.soil.reason === "partly" ? short.soilPartly() : short.soilThawed();
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

    // A thin snow somewhere is not "0 %": at least 1 % once any lies.
    const snowOnMap = $derived(whole.format(Math.max(1, Math.round(board.snow.mapCover * 100))));

    const snowResult = $derived.by(() => {
        const snow = board.snow;
        if (!snow.known) return t.snow.unknown();
        if (snow.mapCover <= 0) return t.snow.none();
        return t.snow.some({ map: snowOnMap, here: share(snow.hereCover) });
    });

    const snowShort = $derived.by(() => {
        const short = t.compare.short;
        if (!board.snow.known) return short.snowUnknown();
        return board.snow.mapCover <= 0 ? short.snowNone() : short.snowSome({ percent: snowOnMap });
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
                        : seconds < 90 * 60
                          ? t.snow.minutes({ value: whole.format(Math.round(seconds / 60)) })
                          : t.snow.hours({ value: whole.format(Math.round(seconds / 3600)) });
                return t.snow.melting({ temperature, duration });
            }
        }
    });

    // The ice and the snow the server keeps, at their thickest: the state of now and where it goes.
    const keptIce = $derived(board.kept?.ice);
    const keptSnow = $derived(board.kept?.snow);
    const keptIceResult = $derived.by(() => {
        if (!keptIce) return t.kept.iceUnknown();
        return keptIce.mm > 0 ? t.kept.iceUpTo({ thickness: figures.thickness(keptIce.mm) }) : t.kept.iceNone();
    });
    const keptIceShort = $derived(
        keptIce && keptIce.mm > 0
            ? t.compare.short.keptIce({ thickness: figures.thickness(keptIce.mm) })
            : t.compare.short.noIce(),
    );
    // While the server lives the time the room missed, where they go is not what the air of now says: said so.
    const catchingUp = $derived(board.kept?.catchingUp === true);
    const keptIceWhy = $derived(
        !keptIce
            ? []
            : catchingUp && keptIce.mm > 0
              ? [t.kept.catchingUp()]
              : [iceTrendLine(t, figures, keptIce, true)],
    );
    const keptIceNotes = $derived(
        keptIce && keptIce.mm > 0 ? [t.kept.onlyAir(), coverClockLine(t, $locale, board.snow.times)] : [],
    );
    /** The snow: what falls on it first (the old sentence, with its share of flakes), else where the thickest goes. */
    const snowWhy = $derived.by(() => {
        if (board.snow.trend === "building" || !keptSnow || keptSnow.mm <= 0) {
            return snowTrend === undefined ? [] : [snowTrend];
        }
        const trend = catchingUp ? t.kept.catchingUp() : snowTrendLine(t, figures, keptSnow, true);
        return [t.kept.snowPeak({ mm: figures.mm(keptSnow.mm) }), ...(trend === undefined ? [] : [trend])];
    });

    /** Whether this player follows a city of their own: their screen is then set against the map of the server. */
    const apart = $derived(board.follows !== "server" && board.city !== undefined);

    /** What the server itself counts of what falls on the map, whatever this player's screen shows. */
    function serverFall(onMap: Omit<Precipitation, "differs">): string {
        if (!onMap.falling) return t.compare.serverDry();
        if (onMap.form === "rain") return t.compare.serverRain();
        return onMap.form === "snow" ? t.compare.serverSnow() : t.compare.serverMix({ share: share(onMap.share) });
    }

    interface Card {
        id: string;
        title: string;
        owner: AirOwner;
        audience: Audience;
        result: string;
        why: string[];
        change: string[];
        notes: string[];
        more: string;
        /** The same thing by the air of the map, shown when it is not what this player sees. */
        onMap?: { result: string; why: string[] };
        /** What the gap means: who sees what, and what the server itself counts. */
        gap?: string[];
        /** No gap: said in one line. */
        same?: string;
        /** What the server works out whatever this player's screen shows, for a player who follows a city. */
        server?: string[];
    }

    /** One line when the air of the map decides, or gives the same thing as this player's own. */
    function sameLine(owner: AirOwner, differs: boolean): string | undefined {
        if (differs) return undefined;
        return owner === "own" ? t.compare.sameAsMap() : t.compare.mapWeather();
    }

    const cards = $derived.by((): Card[] => {
        const { precipitation, frost, ice } = board;
        return [
            {
                id: "precipitation",
                title: t.precipitation.title(),
                owner: precipitation.air,
                audience: precipitation.audience,
                result: precipitationResult(precipitation),
                why: [formWhy(precipitation)],
                change: formChange(precipitation),
                notes: [],
                more: t.form.more(),
                onMap:
                    precipitation.differs && precipitation.onMap
                        ? { result: precipitationResult(precipitation.onMap), why: [formWhy(precipitation.onMap)] }
                        : undefined,
                gap:
                    precipitation.differs && precipitation.onMap
                        ? [
                              t.compare.seen({
                                  map: precipitationShort(precipitation.onMap),
                                  own: precipitationShort(precipitation),
                              }),
                              serverFall(precipitation.onMap),
                          ]
                        : undefined,
                same: sameLine(precipitation.air, precipitation.differs),
                // Even without a gap, the rain of their city brings nothing to the map.
                server: precipitation.onMap && !precipitation.differs ? [serverFall(precipitation.onMap)] : undefined,
            },
            {
                id: "downpour",
                title: t.downpour.title(),
                owner: board.downpour.air,
                audience: board.downpour.audience,
                result: downpourResult,
                why: [formWhy(board.downpour)],
                change: formChange(board.downpour),
                notes: [],
                more: t.form.more(),
                server:
                    apart && board.city !== undefined
                        ? [
                              `${t.downpour.always()} ${t.downpour.notYours({
                                  city: board.city,
                                  temperature: degreesOr(board.ownAir?.temperature),
                              })}`,
                          ]
                        : [t.downpour.always()],
            },
            {
                id: "frost",
                title: t.frost.title(),
                owner: frost.air,
                audience: frost.audience,
                result: frostResult(frost),
                why: [frostWhy(frost)],
                change: frostChange === undefined ? [] : [frostChange],
                notes: lags(frost.drawn, frost.frost) ? [t.frost.drawn({ percent: share(frost.drawn ?? 0) })] : [],
                more: t.frost.more(),
                onMap:
                    frost.differs && frost.onMap
                        ? { result: frostResult(frost.onMap), why: [frostWhy(frost.onMap)] }
                        : undefined,
                gap:
                    frost.differs && frost.onMap
                        ? [
                              t.compare.seen({ map: frostShort(frost.onMap), own: frostShort(frost) }),
                              t.compare.frostOnlyDrawn(),
                          ]
                        : undefined,
                same: sameLine(frost.air, frost.differs),
            },
            {
                id: "ice",
                title: t.ice.title(),
                owner: ice.air,
                audience: ice.audience,
                // Who follows the server stands on the ice it keeps, with its past: what is there, not what the air
                // of the instant would form.
                result: ice.air === "map" ? keptIceResult : iceResult(ice),
                why: ice.air === "map" ? keptIceWhy : [iceWhy(ice)],
                change:
                    ice.air === "map"
                        ? []
                        : [
                              t.ice.ladder({
                                  shallows: under(ice.thresholds.shallows),
                                  pools: under(ice.thresholds.pools),
                                  all: under(ice.thresholds.all),
                              }),
                          ],
                notes: ice.air === "map" ? keptIceNotes : lags(ice.drawn, ice.ice) ? [t.ice.drawn()] : [],
                more: ice.air === "map" ? t.kept.iceMore() : t.ice.more(),
                onMap: ice.differs ? { result: keptIceResult, why: keptIceWhy } : undefined,
                gap: ice.differs
                    ? [t.compare.seen({ map: keptIceShort, own: iceShort(ice) }), t.compare.iceOnlyDrawn()]
                    : undefined,
                same: sameLine(ice.air, ice.differs),
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
                server: apart
                    ? [
                          ...(board.ownAir?.temperature === undefined
                              ? []
                              : [t.compare.soilNotYours({ temperature: degrees(board.ownAir.temperature) })]),
                          board.soil.frost > 0 ? t.compare.soilFrozen() : t.compare.soilThawed(),
                      ]
                    : undefined,
            },
            {
                id: "snow",
                title: t.snow.title(),
                owner: board.snow.air,
                audience: board.snow.audience,
                result: snowResult,
                why: snowWhy,
                change: [],
                notes: keptSnow && keptSnow.mm > 0 ? [t.kept.onlyAir(), t.snow.water()] : [t.snow.water()],
                more:
                    board.snow.times === 1
                        ? t.snow.honestReal()
                        : t.snow.honest({ times: whole.format(board.snow.times) }),
                server:
                    !board.snow.shown && board.city !== undefined ? [t.snow.hidden({ city: board.city })] : undefined,
            },
        ];
    });

    /** Where this player's screen and the map part, at a glance: only for a player who follows a city. */
    const summary = $derived.by(() => {
        if (!apart) return [];
        const { precipitation, frost, ice } = board;
        const against = (own: string, onMap: string | undefined): string =>
            onMap === undefined ? t.compare.rowAll({ map: own }) : t.compare.row({ own, map: onMap });
        const downpour =
            board.downpour.form === "rain"
                ? t.compare.short.rain()
                : board.downpour.form === "snow"
                  ? t.compare.short.snow()
                  : t.compare.short.mix();
        return [
            {
                id: "precipitation",
                name: t.precipitation.title(),
                text: against(
                    precipitationShort(precipitation),
                    precipitation.onMap && precipitationShort(precipitation.onMap),
                ),
                differs: precipitation.differs,
                compared: precipitation.onMap !== undefined,
            },
            {
                id: "downpour",
                name: t.downpour.title(),
                text: t.compare.rowAll({ map: downpour }),
                differs: false,
                compared: false,
            },
            {
                id: "frost",
                name: t.frost.title(),
                text: against(frostShort(frost), frost.onMap && frostShort(frost.onMap)),
                differs: frost.differs,
                compared: frost.onMap !== undefined,
            },
            {
                id: "ice",
                name: t.ice.title(),
                text: against(iceShort(ice), ice.onMap && keptIceShort),
                differs: ice.differs,
                compared: ice.onMap !== undefined,
            },
            {
                id: "soil",
                name: t.soil.title(),
                text: t.compare.rowAll({ map: soilShort }),
                differs: false,
                compared: false,
            },
            {
                id: "snow",
                name: t.snow.title(),
                text: t.compare.rowHidden({ map: snowShort }),
                differs: false,
                compared: false,
            },
        ];
    });
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
    {#if board.follows === "city" && board.city !== undefined && !$fastWaterStore}
        <!-- The water of a city followed goes at the pace of reality: hours before a lake fills. -->
        <p class="m-0 opacity-80" data-testid="weather-board-fast-water">{$LL.actionbar.fastWater.fromCity()}</p>
    {/if}

    {#if summary.length > 0}
        <div class="flex flex-col gap-0.5 rounded-lg bg-white/10 p-2" data-testid="weather-board-summary">
            <h3 class="m-0 text-xs font-bold">{t.compare.summary()}</h3>
            <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
                {#each summary as row (row.id)}
                    <li class="flex flex-wrap items-baseline gap-x-1" data-testid="weather-board-summary-{row.id}">
                        <span class="opacity-80">{row.name} :</span>
                        <span class={row.differs ? "font-bold" : ""}>{row.text}</span>
                        <span
                            class="rounded-full px-1.5 {row.differs
                                ? 'bg-yellow-400/80 font-bold text-black'
                                : 'opacity-60 ring-1 ring-white/40'}"
                            data-differs={row.differs}
                        >
                            {row.differs ? t.compare.differs() : row.compared ? t.compare.same() : t.compare.server()}
                        </span>
                    </li>
                {/each}
            </ul>
        </div>
    {/if}

    {#each cards as card (card.id)}
        <article
            class="flex flex-col gap-1 rounded-lg border-0 border-s-4 border-solid bg-white/10 p-2 {OWNER_EDGE[
                card.owner
            ]}"
            data-testid="weather-board-{card.id}"
        >
            <h3 class="m-0 text-xs font-bold uppercase tracking-wide opacity-80">{card.title}</h3>
            <div data-testid="weather-board-{card.id}-own" class="flex flex-col gap-1">
                {#if card.onMap}
                    <div class="font-bold text-yellow-300">{t.compare.own()}</div>
                {/if}
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
            </div>
            {#if card.onMap}
                <div
                    class="flex flex-col gap-1 border-0 border-t border-solid border-white/20 pt-1"
                    data-testid="weather-board-{card.id}-map"
                >
                    <div class="font-bold text-blue-500">{t.compare.map()}</div>
                    <p class="m-0 text-sm font-bold" data-testid="weather-board-{card.id}-map-result">
                        {card.onMap.result}
                    </p>
                    {#each card.onMap.why as line (line)}
                        <p class="m-0">{line}</p>
                    {/each}
                </div>
            {/if}
            {#if card.gap}
                <div
                    class="flex flex-col gap-1 rounded bg-yellow-400/20 p-1.5 ring-1 ring-yellow-400"
                    data-testid="weather-board-{card.id}-gap"
                >
                    <div class="font-bold text-yellow-300">{t.compare.gap()}</div>
                    {#each card.gap as line (line)}
                        <p class="m-0">{line}</p>
                    {/each}
                </div>
            {/if}
            {#if card.same}
                <p class="m-0 opacity-80" data-testid="weather-board-{card.id}-same">{card.same}</p>
            {/if}
            {#each card.server ?? [] as line (line)}
                <p class="m-0" data-testid="weather-board-{card.id}-server">{line}</p>
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
