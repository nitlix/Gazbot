import logger from "../util/logger";

const SERVER_NAME = "main"

export default {
    async fetch(request, env, ctx) {
        if (request.url.includes("/ignite")) {
            const server = env.SERVER.get(
                env.SERVER.idFromName(SERVER_NAME)
            );

            return server.fetch(request);
        }
        return new Response("Hello, world!");
    },
    async scheduled(event, env, ctx): Promise<void> {
        const server = env.SERVER.get(env.SERVER.idFromName(SERVER_NAME));
        logger({
            ok: true,
            message: "Igniting server",
        });
        await server.fetch(new Request("https://gazbot.nitlix.net/ignite"));
    },
} satisfies ExportedHandler<Env>;

export { Server } from "./do/server";
