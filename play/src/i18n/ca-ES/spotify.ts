import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Vincula el teu compte de Spotify per mostrar als companys què escoltes.",
        link: "Vincula Spotify",
        linking: "Esperant Spotify…",
        unlink: "Desvincula",
        linked: "El teu compte de Spotify està vinculat.",
        share: "Comparteix el que escolto",
        desktopDetected:
            "Llegit des de l'app Spotify d'aquest ordinador: cap compte per enllaçar, n'hi ha prou amb un compte gratuït.",
        desktopLinkOtherDevices:
            "Per compartir també la música que escoltes en un altre dispositiu (mòbil, reproductor web, altaveu), vincula el teu compte de Spotify.",
        desktopAppHint:
            "Amb l'app d'escriptori de WorkAdventure no cal enllaçar cap compte ni Premium: llegeix l'app Spotify del teu Mac.",
        desktopAppLink: "Baixa l'app d'escriptori",
        serverAppNotice:
            "Sense un Client ID propi, la vinculació fa servir l'app de Spotify d'aquest servidor: demana abans a un administrador que hi afegeixi el teu compte de Spotify (5 persones com a màxim).",
        accessDenied:
            "Spotify es nega a compartir el que escoltes: el teu compte no està registrat a l'app de Spotify d'aquest servidor. Demana a un administrador que l'afegeixi (5 persones com a màxim) o fes servir la teva pròpia app de Spotify.",
        errors: {
            popupBlocked:
                "El navegador ha bloquejat la finestra de Spotify. Permet les finestres emergents per a aquest lloc i torna-ho a provar.",
            cancelled: "La finestra de Spotify s'ha tancat abans de completar la vinculació.",
            denied: "Has rebutjat l'accés a Spotify.",
            failed: "No s'ha pogut vincular Spotify. Comprova el Client ID i l'URI de redirecció de l'app de Spotify.",
            noClientId:
                "No hi ha cap app de Spotify configurada en aquest servidor: introdueix a sota el Client ID de la teva pròpia app.",
        },
        personalApp: {
            title: "Fes servir la meva pròpia app de Spotify",
            explanation:
                "Una app de Spotify només accepta cinc persones. Si l'app d'aquest servidor és plena, crea'n una en pocs minuts:",
            step1: "Obre developer.spotify.com/dashboard i crea una app (cal un compte Spotify Premium).",
            step2: "Afegeix aquesta URI de redirecció: {redirectUri}",
            step3: "Marca «Web API», desa i enganxa aquí el Client ID de l'app.",
            clientIdLabel: "Client ID de la meva app",
            clientIdPlaceholder: "Deixa-ho buit per fer servir l'app d'aquest servidor",
        },
    },
    card: {
        listeningNow: "Escoltant ara",
        listenToo: "Escolta-ho també",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Escolta a Spotify",
        listenOnAppleMusic: "Escolta a Apple Music",
    },
    listeningZone: {
        defaultName: "Zona d'escolta",
        jamOf: "Jam de {name}",
        participants: "{count} a la Jam",
        join: "Uneix-t'hi",
        joined: "A la Jam",
        share: "Comparteix la meva Jam",
        sharePlaceholder: "Enganxa l'enllaç d'invitació de la teva Jam",
        invalidLink: "No és un enllaç d'invitació a una Jam de Spotify.",
        submit: "Comparteix",
        cancel: "Cancel·la",
        stop: "Deixa de compartir",
        noJam: "Encara no es comparteix cap Jam aquí.",
        linkInvite: "Vincula Spotify per compartir el que escoltes",
    },
};

export default spotify;
