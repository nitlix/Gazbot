// Define types for browser, platform, and other components
interface Browser {
    name: string;
    version: string;
}

interface Platform {
    name: string;
    version?: string;
}

interface Device {
    type: string;
    model?: string;
}

interface UserAgentConfig {
    browser: Browser;
    platform: Platform;
    device: Device;
}

// Lists of possible values
const browsers: Browser[] = [
    { name: "Chrome", version: "120.0.0.0" },
    { name: "Firefox", version: "115.0" },
    { name: "Safari", version: "17.0" },
    { name: "Edge", version: "120.0.2210.91" },
    { name: "Opera", version: "106.0.0.0" },
];

const platforms: Platform[] = [
    { name: "Windows", version: "10.0" },
    { name: "Macintosh", version: "10_15_7" },
    { name: "Linux", version: "x86_64" },
    { name: "iPhone" },
    { name: "Android", version: "13" },
];

const devices: Device[] = [
    { type: "desktop" },
    { type: "mobile", model: "iPhone 14" },
    { type: "mobile", model: "Samsung Galaxy S23" },
    { type: "tablet", model: "iPad" },
];

// Utility function to get random item from an array
function getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

// Function to generate a fake user agent
export default function (): string {
    const browser = getRandomItem(browsers);
    const platform = getRandomItem(platforms);
    const device = getRandomItem(devices);

    // Base user agent structure
    let userAgent = `Mozilla/5.0`;

    // Add platform-specific information
    if (platform.name === "Windows") {
        userAgent += ` (Windows NT ${platform.version}; Win64; x64)`;
    } else if (platform.name === "Macintosh") {
        userAgent += ` (Macintosh; Intel Mac OS X ${platform.version?.replace(
            ".",
            "_"
        )})`;
    } else if (platform.name === "Linux") {
        userAgent += ` (X11; Linux ${platform.version})`;
    } else if (platform.name === "iPhone") {
        userAgent += ` (iPhone; CPU iPhone OS ${
            Math.floor(Math.random() * 5) + 14
        }_0 like Mac OS X)`;
    } else if (platform.name === "Android") {
        userAgent += ` (Linux; Android ${platform.version}; ${
            device.model || "Generic Device"
        })`;
    }

    // Add browser-specific information
    if (browser.name === "Chrome") {
        userAgent += ` AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version} Safari/537.36`;
    } else if (browser.name === "Firefox") {
        userAgent += ` Gecko/20100101 Firefox/${browser.version}`;
    } else if (browser.name === "Safari") {
        userAgent += ` AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${browser.version} Safari/605.1.15`;
    } else if (browser.name === "Edge") {
        userAgent += ` AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version} Safari/537.36 Edg/${browser.version}`;
    } else if (browser.name === "Opera") {
        userAgent += ` AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version} Safari/537.36 OPR/${browser.version}`;
    }

    return userAgent;
}
