import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const login: DeepPartial<Translation["login"]> = {
    input: {
        name: {
            placeholder: "Entrez votre nom",
            empty: "Le nom est vide",
            tooLongError: "Le nom est trop long",
            notValidError:
                "Lettres latines et accents, chiffres, _ et -. Trois mots maximum, au moins deux caractères par mot et un seul espace entre les mots.",
        },
    },
    genericError: "Une erreur est survenue",
    terms: "En continuant, vous acceptez {links}.",
    termsOfUse: "nos conditions d'utilisation",
    privacyPolicy: "notre politique de confidentialité",
    cookiePolicy: "notre politique relative aux cookies",
    continue: "Continuer",
};

export default login;
