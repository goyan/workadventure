import type { BaseTranslation } from "../i18n-types";

const login: BaseTranslation = {
    input: {
        name: {
            placeholder: "Enter your name",
            empty: "The name is empty",
            tooLongError: "Name is too long",
            notValidError: "Letters, numbers, _ and - only, without spaces. Start with a letter or number.",
        },
    },
    genericError: "An error occurred",
    terms: "By continuing, you are agreeing our {links}.",
    termsOfUse: "terms of use",
    privacyPolicy: "privacy policy",
    cookiePolicy: "cookie policy",
    continue: "Continue",
};

export default login;
