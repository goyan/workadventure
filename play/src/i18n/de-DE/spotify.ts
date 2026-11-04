import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Verknüpfe dein Spotify-Konto, um deinen Kollegen zu zeigen, was du hörst.",
        link: "Spotify verknüpfen",
        linking: "Warte auf Spotify…",
        unlink: "Trennen",
        linked: "Dein Spotify-Konto ist verknüpft.",
        share: "Teilen, was ich höre",
        desktopDetected:
            "Aus der Spotify-App dieses Computers gelesen: kein Konto zu verknüpfen, ein kostenloses Spotify-Konto genügt.",
        desktopLinkOtherDevices:
            "Um auch Musik zu teilen, die du auf einem anderen Gerät hörst (Handy, Webplayer, Lautsprecher), verknüpfe dein Spotify-Konto.",
        desktopAppHint:
            "Mit der WorkAdventure-Desktop-App kein Konto zu verknüpfen und kein Premium nötig: Sie liest die Spotify-App Ihres Macs.",
        desktopAppLink: "Desktop-App herunterladen",
        serverAppNotice:
            "Ohne eigene Client-ID verknüpfst du dich über die Spotify-App dieses Servers: Bitte zuerst einen Administrator, dein Spotify-Konto dort hinzuzufügen (höchstens 5 Personen).",
        accessDenied:
            "Spotify verweigert das Teilen dessen, was du hörst: Dein Konto ist nicht in der Spotify-App dieses Servers eingetragen. Bitte einen Administrator, es hinzuzufügen (höchstens 5 Personen), oder verwende deine eigene Spotify-App.",
        errors: {
            popupBlocked:
                "Dein Browser hat das Spotify-Fenster blockiert. Erlaube Pop-ups für diese Seite und versuche es erneut.",
            cancelled: "Das Spotify-Fenster wurde geschlossen, bevor die Verknüpfung erstellt wurde.",
            denied: "Du hast den Zugriff bei Spotify abgelehnt.",
            failed: "Spotify konnte nicht verknüpft werden. Prüfe die Client-ID und die Weiterleitungs-URI der Spotify-App.",
            noClientId:
                "Auf diesem Server ist keine Spotify-App eingerichtet: Gib unten die Client-ID deiner eigenen App ein.",
        },
        personalApp: {
            title: "Meine eigene Spotify-App verwenden",
            explanation:
                "Eine Spotify-App akzeptiert nur fünf Personen. Ist die App dieses Servers voll, erstelle in wenigen Minuten deine eigene:",
            step1: "Öffne developer.spotify.com/dashboard und erstelle eine App (ein Spotify-Premium-Konto ist erforderlich).",
            step2: "Füge diese Weiterleitungs-URI hinzu: {redirectUri}",
            step3: "Aktiviere „Web API“, speichere und füge hier die Client-ID der App ein.",
            clientIdLabel: "Client-ID meiner App",
            clientIdPlaceholder: "Leer lassen, um die App dieses Servers zu verwenden",
        },
    },
    card: {
        listeningNow: "Hört gerade",
        listenToo: "Auch anhören",
        listenAlong: "Mithören",
        stopListeningAlong: "Mithören beenden",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Auf Spotify anhören",
        listenOnAppleMusic: "Auf Apple Music anhören",
    },
    listeningZone: {
        defaultName: "Hörzone",
        jamOf: "Jam von {name}",
        participants: "{count} im Jam",
        join: "Beitreten",
        joined: "Im Jam",
        share: "Meinen Jam teilen",
        sharePlaceholder: "Füge den Einladungslink deines Jams ein",
        invalidLink: "Das ist kein Einladungslink für einen Spotify-Jam.",
        submit: "Teilen",
        cancel: "Abbrechen",
        stop: "Teilen beenden",
        noJam: "Hier wird noch kein Jam geteilt.",
        linkInvite: "Verknüpfe Spotify, um zu teilen, was du hörst",
    },
};

export default spotify;
