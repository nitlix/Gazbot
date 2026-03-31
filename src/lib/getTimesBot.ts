import logger from "../util/logger";
import { EVENT_HASH } from "../vars/vars";
import { Order, Proxy } from "../cloudflare/do/server";
import createFakeUserAgent from "./fake/createFakeUserAgent";

// Global proxy index for rotation
let currentProxyIndex = 0;

// Helper function to make HTTP request through proxy
async function fetchWithProxy(
    url: string,
    options: RequestInit,
    proxy?: Proxy
): Promise<Response> {
    if (!proxy) {
        return await fetch(url, options);
    }

    const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;

    try {
        return await fetch(url, {
            ...options,
            proxy: proxyUrl,
        });
    } catch (error) {
        console.log(error);
        return await fetch(url, options);
    }
}

interface GazpromTimeResponse {
    calendar: {
        /**
         * e.g. "26.07.2025"
         */
        day: string;
        _time: {
            /**
             * e.g. "14:00"
             */
            time: string;
            /**
             * e.g. 10
             */
            quantity: number;
            /**
             * e.g. 1
             */
            pricetype_id: string;
        }[];
    }[];
    price: {
        /**
         * e.g. "1"
         */
        zonelevel_id: string;
        /**
         * e.g. "1118"
         */
        clientcategory_id: string;
        /**
         * e.g. "26.07.2025"
         */
        action_day: string;
        /**
         * e.g. "2100"
         */
        price: string;
        /**
         * e.g. "0"
         */
        priceservise: string;
        /**
         * e.g. "Нет"
         */
        usecard: string;
        /**
         * e.g. "Нет"
         */
        usepromo: string;
        /**
         * e.g. "9682"
         */
        action_id: string;
        /**
         * e.g. "Взрослый (с 16 лет)"
         */
        category_ru: string;

        /**
         * e.g. "На 1 человека"
         */
        zonelevel_ru: string;

        /**
         * e.g. "1"
         */
        passagequant: string;
        /**
         * e.g. "0"
         */
        needprice: string;
        /**
         * e.g. "2"
         */
        pricetype_id: string;
        /**
         * e.g. "0"
         */
        useproculture: string;
        /**
         * e.g. "0"
         */
        minlimit: string;
        /**
         * e.g. "1000"
         */
        maxlimit: string;
    }[];
    ticketInfo: boolean;
    checkboxList: {
        id: string;
    }[];
}

export interface GazbotTimeAvailable {
    day: string;
    time: string;
    unix: Date;
    quantity: number;
    pricetype_id: string;
}

export type GazbotTimeResponse = {
    _timesAvailable: GazbotTimeAvailable[];
} & GazpromTimeResponse;

// Helper function to check if an order fits into a time slot
export function orderFitsInTimeSlot(
    order: Order,
    timeSlot: GazbotTimeAvailable
): boolean {
    // Convert order date constraints to unix timestamps
    const minDateUnix = new Date(`${order.minDate}T00:00:00`).getTime();
    const maxDateUnix = new Date(`${order.maxDate}T23:59:59`).getTime();

    // Convert order time constraints for the specific day
    const dayDate = timeSlot.day.split(".").reverse().join("-");
    const minTimeUnix = new Date(`${dayDate}T${order.minTime}:00`).getTime();
    const maxTimeUnix = new Date(`${dayDate}T${order.maxTime}:00`).getTime();

    // Check if the time slot is within the order's date range
    if (
        timeSlot.unix.getTime() < minDateUnix ||
        timeSlot.unix.getTime() > maxDateUnix
    ) {
        return false;
    }

    // Check if the time slot is within the order's time range
    if (
        timeSlot.unix.getTime() < minTimeUnix ||
        timeSlot.unix.getTime() > maxTimeUnix
    ) {
        return false;
    }

    // Check if the time slot has enough quantity for the order
    const orderQuantity = Object.values(order.types).reduce(
        (sum, qty) => sum + qty,
        0
    );
    if (timeSlot.quantity < orderQuantity) {
        return false;
    }

    return true;
}

export default async function ({
    xsrfToken,
    orders,
    proxies = [],
}: {
    xsrfToken: string;
    orders: Order[];
    proxies?: Proxy[];
}): Promise<GazbotTimeResponse | null> {
    try {
        // Prepare fetch options
        const fetchOptions: RequestInit = {
            headers: {
                "Content-Type": "application/json",
                ...(xsrfToken ? { "x-csrf-token": xsrfToken } : {}),
                "x-requested-with": "XMLHttpRequest",
                "User-Agent": createFakeUserAgent(),
            },
            body: JSON.stringify({
                hash: EVENT_HASH,
            }),
            method: "POST",
        };

        // Get current proxy if available
        let currentProxy: Proxy | undefined;
        if (proxies.length > 0) {
            currentProxy = proxies[currentProxyIndex];

            // Log which proxy is being used
            // logger({
            //     ok: true,
            //     message: `Using proxy ${currentProxyIndex + 1}/${
            //         proxies.length
            //     }: ${currentProxy.ip}:${currentProxy.port}`,
            // });

            // logDiscord(
            //     `Attempting to use proxy ${currentProxyIndex + 1}/${proxies.length
            //     }: ${currentProxy.ip}:${currentProxy.port}`
            // );

            // Increment proxy index for next request
            currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
        }

        // Make the request (with or without proxy)
        const res = await fetchWithProxy(
            "https://tickets.lakhta.events/api/no-scheme",
            fetchOptions,
            currentProxy
        );

        // Make additional request to edge.nitlix.net to check proxy IP

        const data = (await res.json()) as {
            response: GazpromTimeResponse | null;
        };
        if (data.response) {
            return {
                ...data.response,
                // Get available times by going through each date, and each time, and checking if the quantity is greater than 0
                // Then flatten
                _timesAvailable: data.response.calendar
                    .map((date) => {
                        return date._time
                            .map((time) => {
                                const unix = new Date(
                                    date.day.split(".").reverse().join("-") +
                                    "T" +
                                    time.time +
                                    ":00"
                                );

                                // Only filter out times with 0 quantity
                                if (time.quantity <= 0) {
                                    return;
                                }

                                return {
                                    day: date.day,
                                    time: time.time,
                                    // date format is dd.mm.yyyy
                                    unix,
                                    quantity: time.quantity,
                                    pricetype_id: time.pricetype_id,
                                };
                            })
                            .filter((time) => time !== undefined);
                    })
                    .flat(),
            };
        } else {
            logger({
                ok: false,
                message: "No times returned",
                data: data,
            });
            return null;
        }
    } catch (error) {
        console.log(error);
        logger({
            ok: false,
            message: "Network error when fetching times",
            data: error,
        });
        return null;
    }
}
