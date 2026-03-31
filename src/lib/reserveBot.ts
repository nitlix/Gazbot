import { GazbotTimeResponse, GazbotTimeAvailable } from "./getTimes";
import {
    AUTH_COOKIE,
    AUTH_COOKIE_NAME,
    EVENT_HASH,
    FAKE_FIOS_MALE,
    FAKE_FIOS_FEMALE,
    FAKE_FIO_GENDER,
} from "../vars/vars";

// Helper function to generate random name
function generateRandomName(): string {
    const isMale = FAKE_FIO_GENDER === "male";
    const fio = isMale
        ? `${
              FAKE_FIOS_MALE[0][
                  Math.floor(Math.random() * FAKE_FIOS_MALE[0].length)
              ]
          } ${
              FAKE_FIOS_MALE[1][
                  Math.floor(Math.random() * FAKE_FIOS_MALE[1].length)
              ]
          } ${
              FAKE_FIOS_MALE[2][
                  Math.floor(Math.random() * FAKE_FIOS_MALE[2].length)
              ]
          }`
        : `${
              FAKE_FIOS_FEMALE[0][
                  Math.floor(Math.random() * FAKE_FIOS_FEMALE[0].length)
              ]
          } ${
              FAKE_FIOS_FEMALE[1][
                  Math.floor(Math.random() * FAKE_FIOS_FEMALE[1].length)
              ]
          } ${
              FAKE_FIOS_FEMALE[2][
                  Math.floor(Math.random() * FAKE_FIOS_FEMALE[2].length)
              ]
          }`;
    return fio;
}

// Helper function to generate random phone number
function generateRandomPhone(): string {
    const randomDigits = Array.from({ length: 7 }, () =>
        Math.floor(Math.random() * 10)
    ).join("");
    return `+7911${randomDigits}`;
}

export default async function ({
    time,
    gtr,
    xsrfToken,
    contactInfo,
    orderTypes,
    authToken,
}: {
    time: GazbotTimeAvailable;
    gtr: NonNullable<GazbotTimeResponse>;
    xsrfToken: string;
    contactInfo: {
        fio: string;
        phone: string;
        email: string;
    };
    orderTypes: Record<string, number>;
    authToken?: string;
}) {
    // Check if the name contains "random" (case-insensitive) and generate random name if it does
    let fio = contactInfo.fio;
    if (fio.toLowerCase().includes("random")) {
        fio = generateRandomName();
    }

    // Check if the phone contains "random" (case-insensitive) and generate random phone if it does
    let phone = contactInfo.phone;
    if (phone.toLowerCase().includes("random")) {
        phone = generateRandomPhone();
    }

    const { email } = contactInfo;
    const body = {
        fio,
        phone,
        email,
        re_email: email,
        data: gtr.price
            .map((p) => {
                if (p.action_day !== time.day) return;
                if (p.pricetype_id !== time.pricetype_id) return;

                // Check if this price category matches any of our order types
                // Match by checking if the lowercase key can fit in the lowercase category_ru
                let quantity = 0;
                for (const [key, value] of Object.entries(orderTypes)) {
                    if (
                        p.category_ru.toLowerCase().includes(key.toLowerCase())
                    ) {
                        quantity = value;
                        break; // Use the first matching category
                    }
                }

                // If no quantity found, skip this price entry
                if (quantity === 0) return;

                return {
                    day: time.day,
                    time: time.time,
                    actionId: p.action_id,
                    categoryId: p.clientcategory_id,
                    zoneId: p.zonelevel_id,
                    quantity: quantity,
                    sum: Number(p.price) * quantity,
                };
            })
            .filter((p) => p !== undefined),
        lang: "ru",
        hash: "23FA307410B1F9BE84842D1ABE30D6AB48EA2CF8",
        checkboxList: gtr.checkboxList.map((c) => ({
            id: Number(c.id),
            checked: 1,
        })),
        crmClient: { REFERRAL: "" },
    };

    const response = await fetch(
        "https://tickets.lakhta.events/api/order/create",
        {
            headers: {
                "x-csrf-token": xsrfToken,
                "x-requested-with": "XMLHttpRequest",
                Cookie: `${AUTH_COOKIE_NAME}=${authToken || AUTH_COOKIE};`,
            },
            referrer: `https://tickets.lakhta.events/event/${EVENT_HASH}/${time.day
                .split(".")
                .reverse()
                .join("-")}/${time.time}`,
            referrerPolicy: "strict-origin-when-cross-origin",
            body: JSON.stringify(body),
            method: "POST",
            mode: "cors",
            credentials: "include",
        }
    );

    return (await response.json()) as {
        response:
            | {
                  errorText: string;
              }
            | {
                  hash: string;
              };
    };
}
