import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Vincula tu cuenta de Spotify para mostrar a tus compañeros lo que escuchas.",
        link: "Vincular Spotify",
        linking: "Esperando a Spotify…",
        unlink: "Desvincular",
        linked: "Tu cuenta de Spotify está vinculada.",
        share: "Compartir lo que escucho",
        desktopDetected:
            "Leído desde la app de Spotify de este ordenador: sin cuenta que vincular, basta con una cuenta gratuita.",
        desktopLinkOtherDevices:
            "Para compartir también la música que escuchas en otro dispositivo (móvil, reproductor web, altavoz), vincula tu cuenta de Spotify.",
        desktopAppHint:
            "Con la app de escritorio de WorkAdventure no hace falta vincular cuenta ni Premium: lee la app de Spotify de tu Mac.",
        desktopAppLink: "Descargar la app de escritorio",
        serverAppNotice:
            "Sin un Client ID propio, la vinculación usa la app de Spotify de este servidor: pide antes a un administrador que añada tu cuenta de Spotify (5 personas como máximo).",
        accessDenied:
            "Spotify se niega a compartir lo que escuchas: tu cuenta no está registrada en la app de Spotify de este servidor. Pide a un administrador que la añada (5 personas como máximo) o usa tu propia app de Spotify.",
        errors: {
            popupBlocked:
                "Tu navegador bloqueó la ventana de Spotify. Permite las ventanas emergentes para este sitio y vuelve a intentarlo.",
            cancelled: "La ventana de Spotify se cerró antes de completar la vinculación.",
            denied: "Has rechazado el acceso en Spotify.",
            failed: "No se pudo vincular Spotify. Comprueba el Client ID y la URI de redirección de la app de Spotify.",
            noClientId:
                "No hay ninguna app de Spotify configurada en este servidor: introduce abajo el Client ID de tu propia app.",
        },
        personalApp: {
            title: "Usar mi propia app de Spotify",
            explanation:
                "Una app de Spotify solo acepta cinco personas. Si la app de este servidor está completa, crea la tuya en unos minutos:",
            step1: "Abre developer.spotify.com/dashboard y crea una app (se necesita una cuenta Spotify Premium).",
            step2: "Añade esta URI de redirección: {redirectUri}",
            step3: "Marca «Web API», guarda y pega aquí el Client ID de la app.",
            clientIdLabel: "Client ID de mi app",
            clientIdPlaceholder: "Déjalo vacío para usar la app de este servidor",
        },
    },
    card: {
        listeningNow: "Escuchando ahora",
        listenToo: "Escuchar también",
        listenAlong: "Escuchar a la vez",
        stopListeningAlong: "Dejar de escuchar a la vez",
        playlist: "Lista: {name}",
        album: "Álbum: {name}",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Escuchar en Spotify",
        listenOnAppleMusic: "Escuchar en Apple Music",
    },
    listeningZone: {
        defaultName: "Zona de escucha",
        jamOf: "Jam de {name}",
        participants: "{count} en la Jam",
        join: "Unirse",
        joined: "En la Jam",
        share: "Compartir mi Jam",
        sharePlaceholder: "Pega el enlace de invitación de tu Jam",
        invalidLink: "No es un enlace de invitación a una Jam de Spotify.",
        submit: "Compartir",
        cancel: "Cancelar",
        stop: "Dejar de compartir",
        noJam: "Todavía no se comparte ninguna Jam aquí.",
        linkInvite: "Vincula Spotify para compartir lo que escuchas",
    },
};

export default spotify;
