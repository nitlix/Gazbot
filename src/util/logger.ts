import style from "../lib/colors/style";

export default function logger({
    ok,
    message,
    data,
}: {
    ok: boolean;
    message: string;
    data?: any;
}) {
    console.log(
        `${style(
            style(` GazBot ${new Date().toLocaleTimeString()} `, "BgBlue"),
            "FgWhite"
        )} ${message}`,
        data ? JSON.stringify(data, null, 2) : ""
    );
}
