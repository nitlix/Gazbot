import logger from "../util/logger";
import {
    BOOKING_MAX_TIME,
    BOOKING_MATCHER,
    BOOKING_MIN_TIME,
    EVENT_HASH,
    BOOKING_MIN_DATE,
    BOOKING_MAX_DATE,
} from "../vars/vars";

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

const minSeats = Object.values(BOOKING_MATCHER).reduce(
    (acc, curr) => acc + curr,
    0
);

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

export default async function getTimes({
    xsrfToken,
}: {
    xsrfToken: string;
}): Promise<GazbotTimeResponse | null> {
    try {
        const res = await fetch("https://tickets.lakhta.events/api/no-scheme", {
            headers: {
                "Content-Type": "application/json",
                ...(xsrfToken ? { "x-csrf-token": xsrfToken } : {}),
                "x-requested-with": "XMLHttpRequest",
            },
            body: JSON.stringify({
                hash: EVENT_HASH,
            }),
            method: "POST",
        });
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

                                const maxUnix = new Date(
                                    date.day.split(".").reverse().join("-") +
                                    "T" +
                                    BOOKING_MAX_TIME +
                                    ":00"
                                ).getTime();

                                const minUnix = new Date(
                                    date.day.split(".").reverse().join("-") +
                                    "T" +
                                    BOOKING_MIN_TIME +
                                    ":00"
                                ).getTime();

                                const minDateUnix = new Date(
                                    `${BOOKING_MIN_DATE}T00:00:00`
                                ).getTime();

                                const maxDateUnix = new Date(
                                    `${BOOKING_MAX_DATE}T23:59:59`
                                ).getTime();

                                if (
                                    time.quantity < minSeats ||
                                    unix.getTime() < minUnix ||
                                    unix.getTime() > maxUnix ||
                                    unix.getTime() < minDateUnix ||
                                    unix.getTime() > maxDateUnix
                                ) {
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
        logger({
            ok: false,
            message: "Network error when fetching times",
            data: error,
        });
        return null;
    }
}
