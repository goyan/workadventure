import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Koppel je Spotify-account om je collega's te laten zien waar je naar luistert.",
        link: "Spotify koppelen",
        linking: "Wachten op Spotify…",
        unlink: "Ontkoppelen",
        linked: "Je Spotify-account is gekoppeld.",
        share: "Delen waar ik naar luister",
        serverAppNotice:
            "Zonder eigen client-ID koppel je via de Spotify-app van deze server: vraag eerst een beheerder om je Spotify-account eraan toe te voegen (maximaal 5 personen).",
        accessDenied:
            "Spotify weigert te delen waar je naar luistert: je account is niet geregistreerd in de Spotify-app van deze server. Vraag een beheerder om het toe te voegen (maximaal 5 personen), of gebruik je eigen Spotify-app.",
        errors: {
            popupBlocked:
                "Je browser heeft het Spotify-venster geblokkeerd. Sta pop-ups toe voor deze site en probeer het opnieuw.",
            cancelled: "Het Spotify-venster is gesloten voordat de koppeling klaar was.",
            denied: "Je hebt de toegang op Spotify geweigerd.",
            failed: "Spotify kon niet worden gekoppeld. Controleer de client-ID en de redirect-URI van de Spotify-app.",
            noClientId:
                "Er is geen Spotify-app ingesteld op deze server: vul hieronder de client-ID van je eigen app in.",
        },
        personalApp: {
            title: "Mijn eigen Spotify-app gebruiken",
            explanation:
                "Een Spotify-app accepteert maar vijf mensen. Is de app van deze server vol, maak dan in een paar minuten je eigen app:",
            step1: "Open developer.spotify.com/dashboard en maak een app (een Spotify Premium-account is vereist).",
            step2: "Voeg deze redirect-URI toe: {redirectUri}",
            step3: 'Vink "Web API" aan, sla op en plak hier de client-ID van de app.',
            clientIdLabel: "Client-ID van mijn app",
            clientIdPlaceholder: "Leeg laten om de app van deze server te gebruiken",
        },
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Luisteren op Spotify",
    },
    listeningZone: {
        defaultName: "Luisterzone",
        jamOf: "Jam van {name}",
        participants: "{count} in de Jam",
        join: "Meedoen",
        joined: "In de Jam",
        share: "Mijn Jam delen",
        sharePlaceholder: "Plak de uitnodigingslink van je Jam",
        invalidLink: "Dit is geen uitnodigingslink voor een Spotify-Jam.",
        submit: "Delen",
        cancel: "Annuleren",
        stop: "Stoppen met delen",
        noJam: "Hier wordt nog geen Jam gedeeld.",
        linkInvite: "Koppel Spotify om te delen waar je naar luistert",
    },
};

export default spotify;
