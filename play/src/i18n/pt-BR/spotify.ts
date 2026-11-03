import type { Translation } from "../i18n-types";
import type { DeepPartial } from "../DeepPartial";

const spotify: DeepPartial<Translation["spotify"]> = {
    settings: {
        title: "Spotify",
        description: "Vincule sua conta do Spotify para mostrar aos colegas o que você está ouvindo.",
        link: "Vincular Spotify",
        linking: "Aguardando o Spotify…",
        unlink: "Desvincular",
        linked: "Sua conta do Spotify está vinculada.",
        share: "Compartilhar o que eu ouço",
        serverAppNotice:
            "Sem um Client ID próprio, a vinculação usa o app do Spotify deste servidor: peça antes a um administrador para adicionar sua conta do Spotify (no máximo 5 pessoas).",
        accessDenied:
            "O Spotify se recusa a compartilhar o que você ouve: sua conta não está cadastrada no app do Spotify deste servidor. Peça a um administrador para adicioná-la (no máximo 5 pessoas) ou use seu próprio app do Spotify.",
        errors: {
            popupBlocked:
                "Seu navegador bloqueou a janela do Spotify. Permita pop-ups para este site e tente novamente.",
            cancelled: "A janela do Spotify foi fechada antes de concluir a vinculação.",
            denied: "Você recusou o acesso no Spotify.",
            failed: "Não foi possível vincular o Spotify. Verifique o Client ID e a URI de redirecionamento do app do Spotify.",
            noClientId:
                "Nenhum app do Spotify está configurado neste servidor: informe abaixo o Client ID do seu próprio app.",
        },
        personalApp: {
            title: "Usar meu próprio app do Spotify",
            explanation:
                "Um app do Spotify aceita apenas cinco pessoas. Se o app deste servidor estiver cheio, crie o seu em poucos minutos:",
            step1: "Abra developer.spotify.com/dashboard e crie um app (é necessária uma conta Spotify Premium).",
            step2: "Adicione esta URI de redirecionamento: {redirectUri}",
            step3: 'Marque "Web API", salve e cole aqui o Client ID do app.',
            clientIdLabel: "Client ID do meu app",
            clientIdPlaceholder: "Deixe vazio para usar o app deste servidor",
        },
    },
    userList: {
        jam: "Jam · {area}",
        listenOnSpotify: "Ouvir no Spotify",
    },
    listeningZone: {
        defaultName: "Zona de escuta",
        jamOf: "Jam de {name}",
        participants: "{count} na Jam",
        join: "Entrar",
        joined: "Na Jam",
        share: "Compartilhar minha Jam",
        sharePlaceholder: "Cole o link de convite da sua Jam",
        invalidLink: "Este não é um link de convite para uma Jam do Spotify.",
        submit: "Compartilhar",
        cancel: "Cancelar",
        stop: "Parar de compartilhar",
        noJam: "Nenhuma Jam está sendo compartilhada aqui ainda.",
        linkInvite: "Vincule o Spotify para compartilhar o que você ouve",
    },
};

export default spotify;
