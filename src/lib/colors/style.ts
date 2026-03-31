const styles = {
    Reset: "\x1b[0m",
    Bright: "\x1b[1m",
    Dim: "\x1b[2m",
    Underscore: "\x1b[4m",
    Blink: "\x1b[5m",
    Reverse: "\x1b[7m",
    Hidden: "\x1b[8m",

    FgBlack: "\x1b[30m",
    FgRed: "\x1b[31m",
    FgGreen: "\x1b[32m",
    FgYellow: "\x1b[33m",
    FgBlue: "\x1b[34m",
    FgMagenta: "\x1b[35m",
    FgCyan: "\x1b[36m",
    FgWhite: "\x1b[37m",
    FgGray: "\x1b[90m",

    BgBlack: "\x1b[48;5;232m",
    BgRed: "\x1b[48;5;196m",
    BgGreen: "\x1b[48;5;40m",
    BgYellow: "\x1b[48;5;226m",
    BgBlue: "\x1b[48;5;27m",
    BgMagenta: "\x1b[48;5;199m",
    BgCyan: "\x1b[48;5;51m",
    BgWhite: "\x1b[48;5;255m",
    BgGray: "\x1b[48;5;245m",
};

export default function (text: string, style: keyof typeof styles) {
    return `${styles[style]}${text}${styles.Reset}`;
}
