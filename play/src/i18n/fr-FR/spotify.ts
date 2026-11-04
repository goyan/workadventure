import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Liez votre compte Spotify pour montrer à vos collègues ce que vous écoutez.",
        link: "Lier Spotify",
        linking: "En attente de Spotify…",
        unlink: "Délier",
        linked: "Votre compte Spotify est lié.",
        share: "Partager ce que j'écoute",
        desktopDetected:
            "Lu depuis l'app Spotify de cet ordinateur : aucun compte à relier, un compte Spotify gratuit suffit.",
        desktopLinkOtherDevices:
            "Pour partager aussi la musique écoutée sur un autre appareil (téléphone, lecteur web, enceinte), reliez votre compte Spotify.",
        desktopAppHint:
            "Avec l'app desktop WorkAdventure, pas de compte à relier ni de Premium : elle lit l'app Spotify de votre Mac.",
        desktopAppLink: "Télécharger l'app desktop",
        serverAppNotice:
            "Sans Client ID personnel, la liaison passe par l'app Spotify de ce serveur : demandez d'abord aux administrateurs d'y ajouter votre compte Spotify (5 personnes maximum).",
        accessDenied:
            "Spotify refuse de partager ce que vous écoutez : votre compte n'est pas ajouté à l'app Spotify de ce serveur. Demandez aux administrateurs de l'ajouter (5 personnes maximum), ou utilisez votre propre app Spotify.",
        errors: {
            popupBlocked:
                "Votre navigateur a bloqué la fenêtre Spotify. Autorisez les fenêtres pop-up pour ce site, puis réessayez.",
            cancelled: "La fenêtre Spotify a été fermée avant la liaison.",
            denied: "Vous avez refusé l'accès sur Spotify.",
            failed: "Impossible de lier Spotify. Vérifiez le Client ID et l'URI de redirection de l'app Spotify.",
            noClientId:
                "Aucune app Spotify n'est configurée sur ce serveur : saisissez ci-dessous le Client ID de votre propre app.",
        },
        personalApp: {
            title: "Utiliser ma propre app Spotify",
            explanation:
                "Une app Spotify n'accepte que cinq personnes. Si l'app de ce serveur est complète, créez la vôtre en quelques minutes :",
            step1: "Ouvrez developer.spotify.com/dashboard et créez une app (un compte Spotify Premium est nécessaire).",
            step2: "Ajoutez cette URI de redirection : {redirectUri}",
            step3: "Cochez « Web API », enregistrez, puis collez ici le Client ID de l'app.",
            clientIdLabel: "Client ID de mon app",
            clientIdPlaceholder: "Laisser vide pour utiliser l'app de ce serveur",
        },
    },
    card: {
        listeningNow: "En écoute",
        listenToo: "Écouter aussi",
        listenAlong: "Écouter en même temps",
        stopListeningAlong: "Arrêter d'écouter en même temps",
        listeningAlongCount: "{count} en même temps",
        playlist: "Playlist : {name}",
        album: "Album : {name}",
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Écouter sur Spotify",
        listenOnAppleMusic: "Écouter sur Apple Music",
    },
    listeningZone: {
        defaultName: "Zone d'écoute",
        jamOf: "Jam de {name}",
        participants: "{count} dans la Jam",
        join: "Rejoindre",
        joined: "Dans la Jam",
        share: "Partager ma Jam",
        sharePlaceholder: "Collez le lien d'invitation de votre Jam",
        invalidLink: "Ce n'est pas un lien d'invitation de Jam Spotify.",
        submit: "Partager",
        cancel: "Annuler",
        stop: "Arrêter le partage",
        noJam: "Aucune Jam n'est partagée ici pour l'instant.",
        linkInvite: "Liez Spotify pour partager ce que vous écoutez",
        homeJamOf: "Jam maison de {name}",
        startHome: "Lancer une Jam maison",
        stopHome: "Arrêter la Jam maison",
        joinHome: "Rejoindre la Jam maison",
        leaveHome: "Quitter la Jam maison",
        homeQueueHint: "Dans Spotify, clic droit sur un morceau : « Ajouter à la Jam maison ».",
        homeDesktopOnly: "Jam maison : réservée au client desktop avec Spicetify.",
        rooms: "{count} salon{{s}}",
        leave: "Quitter",
        createRoom: "Créer un salon",
        chooseKind: "Quel type de salon ?",
        kindSpotify: "Spotify",
        kindHome: "Maison",
        kindSpotifyTitle: "Jam Spotify",
        kindSpotifyDescription: "Avec le lien d'invitation de votre Jam. Le son chez chacun demande Premium.",
        kindHomeTitle: "Jam maison",
        kindHomeDescription:
            "Le Spotify de chacun joue vos morceaux, compte gratuit compris. Client desktop et Spicetify.",
        zoneFull: "Cette zone est pleine : 6 salons au plus.",
        titlePlaceholder: "Titre du salon (facultatif)",
        hostedBy: "Animé par {name}",
        jamsButton: "{count} Jam{{s}}",
        roomsTitle: "Jams en cours",
        createHint: "Créez votre salon depuis une zone d'écoute.",
    },
};

export default spotify;
