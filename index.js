import { MongoClient, ServerApiVersion } from "mongodb";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import scheduler from "node-schedule";
import fastify from "fastify";

dotenv.config();

const port = process.env.PORT || 3000;
const host = "RENDER" in process.env ? `0.0.0.0` : `localhost`;

const server = fastify({ logger: true });

const html = `
<!DOCTYPE html>
<html>
  <head>
    <title>OK</title>
  </head>
  <body>
    <section>
      <p>OK</p>
    </section>
  </body>
</html>
`;

server.get("/", function (request, reply) {
    reply.type("text/html").send(html);
});

server.listen({ host: host, port: port }, function (err, address) {
    if (err) {
        server.log.error(err);
        process.exit(1);
    }
});

const {
    TELEGRAM_BOT_TOKEN,
    MONGODB_USER,
    MONGODB_PASSWORD,
    MONGODB_CLUSTER,
    MONGODB_DATABASE,
    KNOWN_CHATS
} = process.env;

const CHATS = Object.fromEntries(KNOWN_CHATS.split(";").map((entry) => entry.split(":")));

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const client = new MongoClient(
    `mongodb+srv://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=Cluster0`,
    {
        serverApi: {
            version: ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true
        }
    }
);

bot.onText(/^\/register/, async (message) => {
    const isKnownChat = message.chat.id in CHATS;
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson || !isKnownChat) return;

    try {
        await client.connect();

        const user = await client.db(MONGODB_DATABASE).collection("participants").findOne({
            id: message.from.id
        });

        if (user) {
            await bot.sendMessage(
                message.chat.id,
                `[${user.name}](tg://user?id=${user.id}) is already registered!`,
                {
                    parse_mode: "Markdown"
                }
            );
            return;
        }

        await client
            .db(MONGODB_DATABASE)
            .collection("participants")
            .insertOne({
                id: message.from.id,
                points: 0,
                name: message.from.username || message.from.first_name
            });

        await bot.sendMessage(
            message.chat.id,
            `[${message.from.username || message.from.first_name}](tg://user?id=${
                message.from.id
            }) successfully registered!`,
            {
                parse_mode: "Markdown"
            }
        );
    } catch (error) {
        await bot.sendMessage(message.chat.id, "Something went wrong...");
        await bot.sendMessage(message.chat.id, String(error));
    } finally {
        await client.close();
    }
});

bot.onText(/^\/lucky/, async (message) => {
    const isKnownChat = message.chat.id in CHATS;
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson || !isKnownChat) return;

    try {
        await client.connect();

        const todaysLucky = await client
            .db(MONGODB_DATABASE)
            .collection("results")
            .findOne({
                date: new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })
            });

        if (todaysLucky) {
            await bot.sendMessage(
                message.chat.id,
                `The luck is over! [${todaysLucky.winner.name}](tg://user?id=${todaysLucky.winner.id}) got it all!`,
                {
                    parse_mode: "Markdown"
                }
            );
            return;
        }

        const users = await client
            .db(MONGODB_DATABASE)
            .collection("participants")
            .find({})
            .toArray();

        if (users.length === 0) {
            await bot.sendMessage(message.chat.id, "No participants yet!", {
                parse_mode: "Markdown"
            });
            return;
        }

        const randomUser = users[Math.floor(Math.random() * users.length)];

        await client
            .db(MONGODB_DATABASE)
            .collection("participants")
            .updateOne({ id: randomUser.id }, { $inc: { points: 1 } });

        await client
            .db(MONGODB_DATABASE)
            .collection("results")
            .insertOne({
                date: new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }),
                winner: randomUser
            });

        await bot.sendMessage(
            message.chat.id,
            `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today!`,
            {
                parse_mode: "Markdown"
            }
        );
    } catch (error) {
        await bot.sendMessage(message.chat.id, "Something went wrong...");
        await bot.sendMessage(message.chat.id, String(error));
    } finally {
        await client.close();
    }
});

bot.onText(/^\/top/, async (message) => {
    const isKnownChat = message.chat.id in CHATS;
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson || !isKnownChat) return;

    try {
        await client.connect();

        const users = await client
            .db(MONGODB_DATABASE)
            .collection("participants")
            .find({})
            .sort("points", "desc")
            .toArray();

        if (users.length === 0) {
            await bot.sendMessage(message.chat.id, "No participants yet!", {
                parse_mode: "Markdown"
            });
            return;
        }

        const messages = ["*Ranking:*"].concat(
            users.map(
                (user, index) =>
                    `${index + 1}. [${user.name}](tg://user?id=${user.id}) - ${user.points} points`
            )
        );

        await bot.sendMessage(message.chat.id, `${messages.join("\n")}`, {
            parse_mode: "Markdown"
        });
    } catch (error) {
        await bot.sendMessage(message.chat.id, "Something went wrong...");
        await bot.sendMessage(message.chat.id, String(error));
    } finally {
        await client.close();
    }
});

bot.onText(/^\/ping/, async (message) => {
    const isKnownChat = message.chat.id in CHATS;
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson || !isKnownChat) return;

    bot.sendMessage(message.chat.id, "Pong!");
});

scheduler.scheduleJob(
    {
        rule: "0 12 * * *",
        tz: "Europe/Kyiv"
    },
    async () => {
        try {
            await client.connect();

            const todaysLucky = await client
                .db(MONGODB_DATABASE)
                .collection("results")
                .findOne({
                    date: new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" })
                });

            if (todaysLucky) {
                await bot.sendMessage(
                    CHATS.MASTER_CHAT,
                    `The luck is over! [${todaysLucky.winner.name}](tg://user?id=${todaysLucky.winner.id}) got it all!`,
                    {
                        parse_mode: "Markdown"
                    }
                );
                return;
            }

            const users = await client
                .db(MONGODB_DATABASE)
                .collection("participants")
                .find({})
                .toArray();

            if (users.length === 0) {
                await bot.sendMessage(CHATS.MASTER_CHAT, "No participants yet!", {
                    parse_mode: "Markdown"
                });
                return;
            }

            const randomUser = users[Math.floor(Math.random() * users.length)];

            await client
                .db(MONGODB_DATABASE)
                .collection("participants")
                .updateOne({ id: randomUser.id }, { $inc: { points: 1 } });

            await client
                .db(MONGODB_DATABASE)
                .collection("results")
                .insertOne({
                    date: new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }),
                    winner: randomUser
                });

            await bot.sendMessage(
                CHATS.MASTER_CHAT,
                `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today!`,
                {
                    parse_mode: "Markdown"
                }
            );
        } catch (error) {
            await bot.sendMessage(CHATS.MASTER_CHAT, "Something went wrong...");
            await bot.sendMessage(CHATS.MASTER_CHAT, String(error));
        } finally {
            await client.close();
        }
    }
);
