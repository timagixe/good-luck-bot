import { MongoClient, ServerApiVersion } from "mongodb";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const { TELEGRAM_BOT_TOKEN, MONGODB_USER, MONGODB_PASSWORD, MONGODB_CLUSTER, MONGODB_DATABASE } =
    process.env;

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

bot.onText(/^\/register$/, async (message) => {
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson) return;

    try {
        await client.connect();

        const user = await client
            .db(MONGODB_DATABASE)
            .collection(message.chat.id.toString())
            .findOne({
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
            .collection(message.chat.id.toString())
            .insertOne({
                id: message.from.id,
                points: 0,
                name: message.from.username || message.from.first_name
            });

        await bot.sendMessage(
            message.chat.id,
            `[${message.from.username}](tg://user?id=${message.from.id}) successfully registered!`,
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

bot.onText(/^\/lucky$/, async (message) => {
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson) return;

    try {
        await client.connect();

        const todaysLucky = await client
            .db(MONGODB_DATABASE)
            .collection("results")
            .findOne({
                date: new Date().toLocaleDateString("uk-UA")
            });

        if (todaysLucky) {
            await bot.sendMessage(
                message.chat.id,
                `Luck is on [${todaysLucky.name}](tg://user?id=${todaysLucky.id})'s side today!`,
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

        const randomUser = users[Math.floor(Math.random() * users.length)];

        await client
            .db(MONGODB_DATABASE)
            .collection("participants")
            .updateOne({ id: randomUser.id }, { $inc: { points: 1 } });

        await client
            .db(MONGODB_DATABASE)
            .collection("results")
            .insertOne({
                date: new Date().toLocaleDateString("uk-UA"),
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

bot.onText(/^\/ping$/, async (message) => {
    const isMessageFromPerson = message.from && !message.from.is_bot;

    if (!isMessageFromPerson) return;

    bot.sendMessage(message.chat.id, "Pong!");
});

