import logger from "../util/logger";
import { AUTH_COOKIE, AUTH_COOKIE_NAME } from "../vars/vars";

export default async function (authToken?: string): Promise<string> {
    logger({
        ok: true,
        message: "Getting XSRF token...",
    });

    const res = await fetch("https://tickets.lakhta.events/api/token", {
        headers: {
            Cookie: `${AUTH_COOKIE_NAME}=${authToken || AUTH_COOKIE};`,
            "x-requested-with": "XMLHttpRequest", // Required for XSRF token
        },
        mode: "cors",
        credentials: "include",
    });

    const data = (await res.json()) as { response?: string };

    if (data.response) {
        logger({
            ok: true,
            message: `XSRF token acquired: ${data.response}`,
        });
        return data.response;
    } else {
        logger({
            ok: false,
            message: `Failed to get XSRF token`,
        });
    }

    return "";
}
