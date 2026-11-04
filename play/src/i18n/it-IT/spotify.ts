import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Collega il tuo account Spotify per mostrare ai colleghi cosa stai ascoltando.",
        link: "Collega Spotify",
        linking: "In attesa di Spotify…",
        unlink: "Scollega",
        linked: "Il tuo account Spotify è collegato.",
        share: "Condividi cosa ascolto",
        desktopDetected:
            "Letto dall'app Spotify di questo computer: nessun account da collegare, basta un account gratuito.",
        desktopLinkOtherDevices:
            "Per condividere anche la musica ascoltata su un altro dispositivo (telefono, web player, altoparlante), collega il tuo account Spotify.",
        desktopAppHint:
            "Con l'app desktop di WorkAdventure nessun account da collegare né Premium: legge l'app Spotify del tuo Mac.",
        desktopAppLink: "Scarica l'app desktop",
        serverAppNotice:
            "Senza un Client ID personale, il collegamento usa l'app Spotify di questo server: chiedi prima a un amministratore di aggiungere il tuo account Spotify (al massimo 5 persone).",
        accessDenied:
            "Spotify rifiuta di condividere cosa ascolti: il tuo account non è registrato nell'app Spotify di questo server. Chiedi a un amministratore di aggiungerlo (al massimo 5 persone) oppure usa la tua app Spotify.",
        errors: {
            popupBlocked: "Il browser ha bloccato la finestra di Spotify. Consenti i pop-up per questo sito e riprova.",
            cancelled: "La finestra di Spotify è stata chiusa prima del collegamento.",
            denied: "Hai rifiutato l'accesso su Spotify.",
            failed: "Impossibile collegare Spotify. Controlla il Client ID e l'URI di reindirizzamento dell'app Spotify.",
            noClientId:
                "Su questo server non è configurata alcuna app Spotify: inserisci qui sotto il Client ID della tua app.",
        },
        personalApp: {
            title: "Usa la mia app Spotify",
            explanation:
                "Un'app Spotify accetta solo cinque persone. Se l'app di questo server è piena, crea la tua in pochi minuti:",
            step1: "Apri developer.spotify.com/dashboard e crea un'app (serve un account Spotify Premium).",
            step2: "Aggiungi questo URI di reindirizzamento: {redirectUri}",
            step3: 'Seleziona "Web API", salva e incolla qui il Client ID dell\'app.',
            clientIdLabel: "Client ID della mia app",
            clientIdPlaceholder: "Lascia vuoto per usare l'app di questo server",
        },
    },
    card: {
        listeningNow: "In ascolto",
        listenToo: "Ascolta anche tu",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Ascolta su Spotify",
        listenOnAppleMusic: "Ascolta su Apple Music",
    },
    listeningZone: {
        defaultName: "Zona d'ascolto",
        jamOf: "Jam di {name}",
        participants: "{count} nella Jam",
        join: "Partecipa",
        joined: "Nella Jam",
        share: "Condividi la mia Jam",
        sharePlaceholder: "Incolla il link d'invito della tua Jam",
        invalidLink: "Questo non è un link d'invito a una Jam di Spotify.",
        submit: "Condividi",
        cancel: "Annulla",
        stop: "Interrompi la condivisione",
        noJam: "Qui non è ancora condivisa nessuna Jam.",
        linkInvite: "Collega Spotify per condividere cosa ascolti",
    },
};

export default spotify;
