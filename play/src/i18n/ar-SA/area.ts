import type { DeepPartial } from "../DeepPartial";
import type { Translation } from "../i18n-types";

const area: DeepPartial<Translation["area"]> = {
    noAccess: "عذرًا، ليس لديك إذن للوصول إلى هذه المنطقة.", // Sorry, you do not have permission to access this area.
    blocked: {
        locked: "هذه المنطقة مقفلة. لا يمكنك الدخول.",
        maxUsers: "هذه المنطقة ممتلئة. لا يمكنك الدخول.",
        noAccess: "عذرًا، ليس لديك إذن للوصول إلى هذه المنطقة.",
        unlockWithTrigger: "{trigger} لفتح هذه المنطقة.",
    },
    knock: {
        prompt: "{trigger} to knock.",
        waiting: "You knocked, waiting…",
        later: "Not now.",
        noAnswer: "Nobody answers.",
        opened: "{name} opens the door for you.",
        request: "{name} is knocking at the door",
        enter: "Let in",
        notNow: "Not now",
    },
    personalArea: {
        claimDescription: "هذه منطقة شخصية. هل ترغب في تولي الملكية؟", // This is a personal area. Do you want to claim it?
        buttons: {
            yes: "نعم", // Yes
            no: "لا", // No
            confirm: "تأكيد", // Confirm
        },
        personalSpaceWithNames: "المساحة الشخصية لـ {name}",
        alreadyHavePersonalArea: "لديك بالفعل منطقة شخصية. سيتم حذفها إذا طالبت بهذه المنطقة.",
    },
};

export default area;
