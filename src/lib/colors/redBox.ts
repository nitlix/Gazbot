import style from "./style";

export default function (text: string) {
    return style(style(text, "FgWhite"), "BgRed");
}
