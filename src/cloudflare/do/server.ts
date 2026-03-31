import { DurableObject } from "cloudflare:workers";

import { Bot } from "grammy";

export type Order = {
    id: string;
    email: string;
    phone: string;
    fio: string;
    minDate: string;
    maxDate: string;
    minTime: string;
    maxTime: string;
    types: Record<string, number>;
    ready: boolean;
    createdAt: number;
    userId: string;
    chatId: string;
    lastReserved: number;
};

export type Proxy = {
    ip: string;
    port: string;
    username: string;
    password: string;
};

interface DB {
    orders: Order[];
    userAction: Record<
        string,
        {
            action:
            | "fill_id"
            | "fill_email"
            | "fill_phone"
            | "fill_fio"
            | "fill_minDate"
            | "fill_maxDate"
            | "fill_minTime"
            | "fill_maxTime"
            | "fill_typeName"
            | "fill_typeQuantity"
            | "";
            fillingId?: string;
        }
    >;
    authToken?: string; // Single global auth token
    proxies: Proxy[]; // Array of loaded proxies
}

import {
    MAX_REFETCH_INTERVAL_MS,
    XSRF_TOKEN_REFRESH_INTERVAL_MS,
} from "../../vars/vars";
import getXsrfToken from "../../lib/getXsrfToken";
import getTimesBot, { orderFitsInTimeSlot } from "../../lib/getTimesBot";
import reserveBot from "../../lib/reserveBot";

export class Server extends DurableObject {
    public env: Env;

    constructor(state: DurableObjectState, env: Env) {
        // basically the ignition
        super(state, env);
        this.env = env;

        (async () => {
            let db: DB = {
                orders: [],
                userAction: {},
                authToken: undefined,
                proxies: [],
            };

            async function loadDb() {
                const data = await env.CACHE.get("db");
                if (data) {
                    db = JSON.parse(data);

                    // Ensure all required keys exist with defaults
                    let needsUpdate = false;

                    if (!db.orders) {
                        db.orders = [];
                        needsUpdate = true;
                    }

                    if (!db.userAction) {
                        db.userAction = {};
                        needsUpdate = true;
                    }

                    if (!db.proxies) {
                        db.proxies = [];
                        needsUpdate = true;
                    }

                    // Save updated db back to cache if any keys were missing
                    if (needsUpdate) {
                        await env.CACHE.put("db", JSON.stringify(db));
                        await sendToDiscord(
                            "✅ Updated db structure with missing keys"
                        );
                    } else {
                        await sendToDiscord("✅ Loaded db from cache");
                    }
                } else {
                    await env.CACHE.put("db", JSON.stringify(db));
                    await sendToDiscord("✅ Created db in cache");
                }
            }

            async function sendToDiscord(message: string) {
                if (env.DISCORD_WEBHOOK_URL) {
                    try {
                        await fetch(env.DISCORD_WEBHOOK_URL, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                content: message,
                            }),
                        });
                    } catch (error) {
                        console.error("Failed to send to Discord:", error);
                    }
                }
            }

            loadDb();

            function syncDb() {
                env.CACHE.put("db", JSON.stringify(db));
            }

            function editOrder(id: string, editFunc: (order: Order) => Order) {
                db.orders[db.orders.findIndex((o) => o.id === id)] = editFunc(
                    db.orders[db.orders.findIndex((o) => o.id === id)]
                );
                syncDb();
            }

            function getOrder(id: string) {
                return db.orders[db.orders.findIndex((o) => o.id === id)];
            }

            const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

            bot.command("start", (ctx) => {
                // Send a fancy message, which an image https://static.nitlix.net/github/gazbot1.gif
                ctx.reply(
                    `Welcome, ${ctx.from?.first_name}!\n\nGazBot is an automatic ticket-sniping bot for Gazprom's Lakhta Center 360-degree observation deck, northernmost in the world, highest in Europe, and 20th in the world.`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: "Create order",
                                        url: "https://t.me/gazbot_bot/create",
                                    },
                                ],
                                [{ text: "Help", callback_data: "help" }],
                            ],
                        },
                    }
                );

                ctx.replyWithPhoto(
                    "https://static.nitlix.net/github/gazbot1.gif"
                );
            });

            bot.command("create", (ctx) => {
                db.userAction[ctx.msg.from?.id.toString() ?? ""] = {
                    action: "fill_id",
                };

                ctx.reply("ID?");
            });

            bot.command("delete", (ctx) => {
                const text = ctx.message?.text;
                const userId = ctx.from?.id.toString() ?? "";

                if (!text || text.length < 1) {
                    ctx.reply("Please provide an order ID: /delete <order_id>");
                    return;
                }

                const orderId = text.replace("/delete ", "").trim();

                const order = getOrder(orderId);

                if (!order) {
                    ctx.reply("Order not found");
                    return;
                }

                db.orders = db.orders.filter((o) => o.id !== orderId);
                syncDb();

                ctx.reply(`✅ Order #${orderId} deleted`);
            });

            bot.command("list", (ctx) => {
                const currentTime = Date.now();
                const RESERVATION_TIMEOUT_MS = 29 * 60 * 1000 + 50 * 1000; // 29 minutes and 50 seconds

                ctx.reply(
                    db.orders.length > 0
                        ? `**🗼 Orders:**\n\n${db.orders
                            .map((o) => {
                                let reorderInfo = "";
                                if (o.lastReserved > 0) {
                                    const timeUntilNextReservation =
                                        RESERVATION_TIMEOUT_MS -
                                        (currentTime - o.lastReserved);
                                    if (timeUntilNextReservation > 0) {
                                        const minutes = Math.floor(
                                            timeUntilNextReservation /
                                            (1000 * 60)
                                        );
                                        const seconds = Math.floor(
                                            (timeUntilNextReservation %
                                                (1000 * 60)) /
                                            1000
                                        );
                                        reorderInfo = `\n⌚ Next rebooking in: ${minutes
                                            .toString()
                                            .padStart(2, "0")}:${seconds
                                                .toString()
                                                .padStart(2, "0")}`;
                                    } else {
                                        reorderInfo =
                                            "\n⌚ Ready for rebooking";
                                    }
                                }

                                return `✨ #${o.id}\n**FIO:** ${o.fio
                                    }\n**Phone:** ${o.phone}\n**Email:** ${o.email
                                    }\n**Min date:** ${o.minDate
                                    }\n**Max date:** ${o.maxDate
                                    }\n**Min time:** ${o.minTime
                                    }\n**Max time:** ${o.maxTime
                                    }\n**Types:** ${Object.entries(o.types)
                                        .map(([k, v]) => `"${k}": ${v}`)
                                        .join(", ")}${reorderInfo}\n\n`;
                            })
                            .join("\n\n")}`
                        : "**No orders yet**",
                    {
                        parse_mode: "Markdown",
                    }
                );
            });

            bot.command("token", (ctx) => {
                const text = ctx.message?.text;
                const userId = ctx.from?.id.toString() ?? "";

                if (!text || text.length < 1) {
                    ctx.reply(
                        "Please provide an auth token: /token <your_auth_token>"
                    );
                    return;
                }

                // Extract token from command (remove "/token " prefix)
                const token = text.replace("/token ", "").trim();

                if (token === "/token") {
                    ctx.reply(
                        "Please provide an auth token: /token <your_auth_token>"
                    );
                    return;
                }

                // Store the auth token
                db.authToken = token;
                syncDb();

                ctx.reply(`✅ Auth token stored successfully!`);
            });

            bot.command("checktoken", (ctx) => {
                if (db.authToken) {
                    ctx.reply(
                        `Auth token is set: ${db.authToken.substring(0, 10)}...`
                    );
                } else {
                    ctx.reply(
                        "No auth token is currently set. Use /token <your_auth_token> to set one."
                    );
                }
            });

            bot.command("ip", async (ctx) => {
                try {
                    const response = await fetch(
                        "https://api.ipify.org?format=json"
                    );
                    const data = (await response.json()) as { ip: string };
                    ctx.reply(`🌐 DO IP address is: \`${data.ip}\``, {
                        parse_mode: "Markdown",
                    });
                } catch (error) {
                    ctx.reply(
                        "❌ Failed to fetch IP address. Please try again later."
                    );
                }
            });

            bot.command("loadproxies", async (ctx) => {
                const text = ctx.message?.text;

                if (!text || text.length < 1) {
                    ctx.reply("Please provide a URL: /loadproxies <url>");
                    return;
                }

                // Extract URL from command (remove "/loadproxies " prefix)
                const url = text.replace("/loadproxies ", "").trim();

                if (url === "/loadproxies") {
                    ctx.reply("Please provide a URL: /loadproxies <url>");
                    return;
                }

                try {
                    ctx.reply("🔄 Fetching proxies from URL...");

                    const response = await fetch(url);
                    if (!response.ok) {
                        ctx.reply(
                            `❌ Failed to fetch proxies: HTTP ${response.status}`
                        );
                        return;
                    }

                    const proxyText = await response.text();
                    const proxyLines = proxyText
                        .trim()
                        .split("\n")
                        .filter((line) => line.trim() !== "");

                    const proxies: Proxy[] = [];
                    let validCount = 0;
                    let invalidCount = 0;

                    for (const line of proxyLines) {
                        const parts = line.trim().split(":");
                        if (parts.length === 4) {
                            const [ip, port, username, password] = parts;
                            proxies.push({
                                ip: ip.trim(),
                                port: port.trim(),
                                username: username.trim(),
                                password: password.trim(),
                            });
                            validCount++;
                        } else {
                            invalidCount++;
                        }
                    }

                    if (validCount === 0) {
                        ctx.reply(
                            "❌ No valid proxies found in the provided URL. Expected format: IP:PORT:USERNAME:PASSWORD"
                        );
                        return;
                    }

                    // Store proxies in DB
                    db.proxies = proxies;
                    syncDb();

                    ctx.reply(
                        `✅ Successfully loaded ${validCount} proxies${invalidCount > 0
                            ? ` (${invalidCount} invalid lines ignored)`
                            : ""
                        }`
                    );

                    // Send to Discord for logging
                    await sendToDiscord(
                        `📥 Loaded ${validCount} proxies from URL: ${url}`
                    );
                } catch (error) {
                    ctx.reply(
                        `❌ Failed to load proxies: ${error instanceof Error
                            ? error.message
                            : "Unknown error"
                        }`
                    );
                    await sendToDiscord(
                        `❌ Failed to load proxies from ${url}: ${error}`
                    );
                }
            });

            bot.command("listproxies", (ctx) => {
                if (!db.proxies || db.proxies.length === 0) {
                    ctx.reply(
                        "📭 No proxies loaded. Use /loadproxies <url> to load proxies."
                    );
                    return;
                }

                const proxyList = db.proxies
                    .map(
                        (proxy, index) =>
                            `${index + 1}. ${proxy.ip}:${proxy.port} (${proxy.username
                            })`
                    )
                    .join("\n");

                ctx.reply(
                    `📋 **Loaded Proxies (${db.proxies.length}):**\n\n${proxyList}`,
                    {
                        parse_mode: "Markdown",
                    }
                );
            });

            bot.command("clearproxies", (ctx) => {
                const proxyCount = db.proxies ? db.proxies.length : 0;
                db.proxies = [];
                syncDb();

                ctx.reply(
                    `🗑️ Cleared ${proxyCount} proxies from the database.`
                );

                // Send to Discord for logging
                sendToDiscord(
                    `🗑️ Cleared ${proxyCount} proxies from the database.`
                );
            });

            bot.command("proxystatus", (ctx) => {
                if (!db.proxies || db.proxies.length === 0) {
                    ctx.reply(
                        "📭 No proxies loaded. Use /loadproxies <url> to load proxies."
                    );
                    return;
                }

                ctx.reply(
                    `📊 **Proxy Status:**\n\n` +
                    `📋 Total proxies: ${db.proxies.length}\n` +
                    `🔄 Proxy rotation: Active\n` +
                    `📝 Each request cycles through all proxies\n\n` +
                    `Use /listproxies to see all loaded proxies.`,
                    {
                        parse_mode: "Markdown",
                    }
                );
            });

            bot.on("message", (ctx) => {
                const text = ctx.message.text;
                const userId = ctx.from?.id.toString() ?? "";
                const chatId = ctx.chat?.id.toString() ?? "";

                if (!text || text.length < 1 || !chatId || !userId) {
                    ctx.reply("Invalid input");
                    return;
                }

                const action = db.userAction[userId]?.action;

                if (action === "fill_id") {
                    const orderId = text ?? "";
                    db.userAction[userId] = {
                        action: "fill_email",
                        fillingId: orderId,
                    };
                    syncDb();
                    ctx.reply("Email?");
                } else if (action === "fill_email") {
                    db.orders.push({
                        id: db.userAction[userId].fillingId as string,
                        email: text,
                        phone: "",
                        fio: "",
                        minDate: "",
                        maxDate: "",
                        minTime: "",
                        maxTime: "",
                        types: {},
                        ready: false,
                        createdAt: Date.now(),
                        userId: userId,
                        chatId: chatId,
                        lastReserved: 0,
                    });
                    db.userAction[userId].action = "fill_phone";
                    syncDb();
                    ctx.reply("Phone?");
                } else if (action === "fill_phone") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            phone: text,
                        })
                    );
                    db.userAction[userId].action = "fill_fio";
                    syncDb();
                    ctx.reply("Fio?");
                } else if (action === "fill_fio") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            fio: text,
                        })
                    );
                    db.userAction[userId].action = "fill_minDate";
                    syncDb();
                    ctx.reply("Min date?");
                } else if (action === "fill_minDate") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            minDate: text,
                        })
                    );
                    db.userAction[userId].action = "fill_maxDate";
                    syncDb();
                    ctx.reply("Max date?");
                } else if (action === "fill_maxDate") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            maxDate: text,
                        })
                    );
                    db.userAction[userId].action = "fill_minTime";
                    syncDb();
                    ctx.reply("Min time?");
                } else if (action === "fill_minTime") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            minTime: text,
                        })
                    );
                    db.userAction[userId].action = "fill_maxTime";
                    syncDb();
                    ctx.reply("Max time?");
                } else if (action === "fill_maxTime") {
                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            maxTime: text,
                        })
                    );
                    db.userAction[userId].action = "fill_typeName";
                    syncDb();
                    ctx.reply("Types?");
                } else if (action === "fill_typeName") {
                    const text = ctx.message.text ?? "";
                    if (text.toLowerCase().includes("end")) {
                        editOrder(
                            db.userAction[userId].fillingId as string,
                            (order) => ({
                                ...order,
                                ready: true,
                            })
                        );

                        ctx.reply(
                            `Order ${db.userAction[userId].fillingId} created`
                        );

                        db.userAction[userId].action = "";
                        db.userAction[userId].fillingId = "";

                        syncDb();
                        return;
                    }

                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            types: {
                                ...order.types,
                                [text]: 0,
                            },
                        })
                    );

                    db.userAction[userId].action = "fill_typeQuantity";
                    syncDb();
                    ctx.reply("Quantity?");
                    return;
                } else if (action === "fill_typeQuantity") {
                    const text = ctx.message.text;

                    const order = getOrder(
                        db.userAction[userId].fillingId as string
                    );
                    const keys = Object.keys(order.types);
                    const key = keys[keys.length - 1];

                    editOrder(
                        db.userAction[userId].fillingId as string,
                        (order) => ({
                            ...order,
                            types: {
                                ...order.types,
                                [key]: Number(text),
                            },
                        })
                    );

                    db.userAction[userId].action = "fill_typeName";
                    syncDb();
                    ctx.reply("Type name? (or end)");
                    return;
                }
            });

            bot.start();

            let xsrfToken = await getXsrfToken(db.authToken);
            if (xsrfToken === "") {
                await sendToDiscord("❌ FAILED TO GET XSRF TOKEN, exiting...");
                //message everyone with orders
                for (const order of db.orders) {
                    bot.api.sendMessage(
                        order.chatId,
                        `❌ Failed to get XSRF token, we'll be trying again in ${XSRF_TOKEN_REFRESH_INTERVAL_MS}ms. Please try again later.`
                    );
                }
                return;
            } else {
                await sendToDiscord(`✅ XSRF token acquired - ${xsrfToken}`);
            }

            setInterval(async () => {
                const tempXsrfToken = await getXsrfToken(db.authToken);
                if (tempXsrfToken === "") {
                    await sendToDiscord(
                        `❌ Failed to get XSRF token, we'll be trying again in ${XSRF_TOKEN_REFRESH_INTERVAL_MS}ms.`
                    );
                    //message everyone with orders
                    for (const order of db.orders) {
                        bot.api.sendMessage(
                            order.chatId,
                            `❌ Failed to get XSRF token, we'll be trying again in ${XSRF_TOKEN_REFRESH_INTERVAL_MS}ms. Please try again later.`
                        );
                    }
                    return;
                } else {
                    xsrfToken = tempXsrfToken;
                    await sendToDiscord(
                        `✅ XSRF token refreshed - ${xsrfToken}`
                    );
                }
            }, XSRF_TOKEN_REFRESH_INTERVAL_MS);

            async function updateTrigger() {
                const start = Date.now();
                const currentTime = Date.now();
                const RESERVATION_TIMEOUT_MS = 29 * 60 * 1000 + 50 * 1000; // 29 minutes and 50 seconds
                const times = await getTimesBot({
                    xsrfToken,
                    orders: db.orders.filter(
                        (o) =>
                            o.ready &&
                            (o.lastReserved === 0 ||
                                currentTime - o.lastReserved >
                                RESERVATION_TIMEOUT_MS)
                    ),
                    proxies: db.proxies,
                });
                const end = Date.now();

                if (!times) {
                    await sendToDiscord(
                        `❌ FAILED TO GET TIMES, ping: ${end - start
                        }ms, retrying in 1 second`
                    );
                    setTimeout(updateTrigger, 1000);
                    return;
                }

                if (times._timesAvailable.length === 0) {
                    setTimeout(
                        updateTrigger,
                        Math.max(0, MAX_REFETCH_INTERVAL_MS - (end - start))
                    );
                    await sendToDiscord(
                        `Times fetched, ${times._timesAvailable.length
                        } available, ping: ${end - start
                        }ms, retrying with a ${MAX_REFETCH_INTERVAL_MS}ms timeout. No available times.`
                    );
                } else {
                    const timeSlots = times._timesAvailable
                        .map(
                            (t, i) =>
                                ` ${times._timesAvailable[i].quantity} at ${times._timesAvailable[i].time} `
                        )
                        .join(" ");
                    await sendToDiscord(
                        `Times fetched, ${timeSlots}, ping: ${end - start
                        }ms, processing orders...`
                    );

                    // Sort orders by quantity (biggest to smallest)
                    const sortedOrders = db.orders
                        .filter(
                            (o) =>
                                o.ready &&
                                (o.lastReserved === 0 ||
                                    currentTime - o.lastReserved >
                                    RESERVATION_TIMEOUT_MS)
                        )
                        .sort((a, b) => {
                            const aQuantity = Object.values(a.types).reduce(
                                (sum, qty) => sum + qty,
                                0
                            );
                            const bQuantity = Object.values(b.types).reduce(
                                (sum, qty) => sum + qty,
                                0
                            );
                            return bQuantity - aQuantity; // Biggest first
                        });

                    // Create a copy of available times that we can modify
                    let availableTimes = [...times._timesAvailable];
                    const reservationPromises: Promise<void>[] = [];

                    // Process each order
                    for (const order of sortedOrders) {
                        // Find a time slot that fits this order
                        const fittingTimeIndex = availableTimes.findIndex(
                            (timeSlot) => orderFitsInTimeSlot(order, timeSlot)
                        );

                        if (fittingTimeIndex !== -1) {
                            const fittingTime =
                                availableTimes[fittingTimeIndex];

                            // Remove this time slot from available times
                            availableTimes.splice(fittingTimeIndex, 1);

                            // Start a reservation promise
                            const reservationPromise = (async () => {
                                try {
                                    const res = await reserveBot({
                                        time: fittingTime,
                                        gtr: times,
                                        xsrfToken,
                                        contactInfo: {
                                            fio: order.fio,
                                            phone: order.phone,
                                            email: order.email,
                                        },
                                        orderTypes: order.types,
                                        authToken: db.authToken,
                                    });

                                    if ("errorText" in res.response) {
                                        // logger({
                                        //     ok: false,
                                        //     message: `${redBox(
                                        //         " FAILED TO RESERVE "
                                        //     )} "${
                                        //         res.response.errorText
                                        //     }" for order ${order.id}.`,
                                        // });

                                        bot.api.sendMessage(
                                            order.chatId,
                                            `❌ Failed to reserve for order #${order.id}: ${res.response.errorText}`
                                        );

                                        // Add the time slot back to available times if reservation failed
                                        availableTimes.push(fittingTime);
                                    } else {
                                        // logger({
                                        //     ok: true,
                                        //     message: `${blueBox(
                                        //         " RESERVED SUCCESSFULLY "
                                        //     )} for order ${
                                        //         order.id
                                        //     }. You have 30 minutes to pay before the reservation expires.`,
                                        // });
                                        // logger({
                                        //     ok: true,
                                        //     message: `https://tickets.lakhta.events/order/${res.response.hash}`,
                                        // });

                                        bot.api.sendMessage(
                                            order.chatId,
                                            `✅ Successfully reserved for order #${order.id}. You have 30 minutes to pay before the reservation expires.\n\n🔄 Your order is now in a re-reservation loop and will automatically try again after 29 minutes and 50 seconds if you don't pay.`,
                                            {
                                                reply_markup: {
                                                    inline_keyboard: [
                                                        [
                                                            {
                                                                text: "Pay",
                                                                url: `https://tickets.lakhta.events/order/${res.response.hash}`,
                                                            },
                                                        ],
                                                    ],
                                                },
                                            }
                                        );

                                        // Delete the order from DB and update cache
                                        editOrder(order.id, (order) => ({
                                            ...order,
                                            lastReserved: Date.now(),
                                        }));
                                    }
                                } catch (error) {
                                    await sendToDiscord(
                                        `Error during reservation for order ${order.id}: ${error}`
                                    );
                                    // Add the time slot back to available times if reservation failed
                                    availableTimes.push(fittingTime);
                                }
                            })();

                            await sendToDiscord(
                                `Reserving for order ${order.id} at ${fittingTime.time}...`
                            );

                            reservationPromises.push(reservationPromise);
                        } else {
                            await sendToDiscord(
                                `No fitting time slot found for order ${order.id}.`
                            );
                        }
                    }

                    // Wait for all reservation promises to complete
                    await Promise.all(reservationPromises);

                    await sendToDiscord(
                        `Finished processing orders. Refetching with a ${MAX_REFETCH_INTERVAL_MS}ms timeout.`
                    );

                    setTimeout(
                        updateTrigger,
                        Math.max(0, MAX_REFETCH_INTERVAL_MS - (end - start))
                    );
                }
            }

            updateTrigger();
        })();
    }

    async fetch(request: Request) {
        return Response.json({
            ok: true,
            message: "Hello, world!",
        });
    }
}
