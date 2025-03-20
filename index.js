import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { MongoClient, ServerApiVersion } from "mongodb";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import fastify from "fastify";
import {
  getTodayDate,
  isMessageFromPerson,
  sendMessageWithRetryAndDelay,
  sendVideoWithRetryAndDelay,
} from "./utils.js";
import { getTodaysGame } from "./games.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const port = process.env.PORT || 3000;
const host = "RENDER" in process.env ? `0.0.0.0` : `localhost`;

const server = fastify({ logger: true });

server.get("/", function (_request, reply) {
  reply.type("application/json").send({ status: "OK" });
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
  URL,
} = process.env;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);
bot.setWebHook(`${URL}/bot${TELEGRAM_BOT_TOKEN}`);

server.post(`/bot${TELEGRAM_BOT_TOKEN}`, async (request, reply) => {
  const { body } = request;
  server.log.info(body);
  bot.processUpdate(body);
  reply.send({ ok: true });
});

const client = new MongoClient(
  `mongodb+srv://${MONGODB_USER}:${MONGODB_PASSWORD}@${MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=Cluster0`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

bot.onText(/^\/register/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  try {
    await client.connect();

    const user = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .findOne({
        id: message.from.id,
      });

    if (user) {
      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `[${user.name}](tg://user?id=${user.id}) is already registered!`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
      return;
    }

    await client
      .db(message.chat.id.toString())
      .collection("participants")
      .insertOne({
        id: message.from.id,
        points: 0,
        name: message.from.username || message.from.first_name,
      });

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `[${
        message.from.username || message.from.first_name
      }](tg://user?id=${message.from.id}) successfully registered!`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } catch (error) {
    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `Something went wrong... ${String(error)}`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } finally {
    await client.close();
  }
});

bot.onText(/^\/lucky/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  try {
    await client.connect();

    const todaysLucky = await client
      .db(message.chat.id.toString())
      .collection("results")
      .findOne({
        date: getTodayDate(),
      });

    if (todaysLucky) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        message: `The luck is over! [${todaysLucky.winner.name}](tg://user?id=${todaysLucky.winner.id}) got it all!`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
      return;
    }

    const users = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .find({})
      .toArray();

    if (users.length === 0) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        message: "No participants yet!",
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      return;
    }

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `👥 Found ${users.length} participants in the game!`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });

    const participantsList = ["*Participants:*"].concat(
      users.map(
        (user) =>
          `• [${user.name}](tg://user?id=${user.id}) - ${user.points} points`
      )
    );

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: participantsList.join("\n"),
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });

    const today = new Date();
    const game = getTodaysGame(today);

    const randomUser = await game.playFn({
      bot,
      users,
      chatId: message.chat.id,
    });

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: "📊 Updating points...",
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });

    await client
      .db(message.chat.id.toString())
      .collection("participants")
      .updateOne({ id: randomUser.id }, { $inc: { points: 1 } });

    await client
      .db(message.chat.id.toString())
      .collection("results")
      .insertOne({
        date: getTodayDate(),
        winner: randomUser,
      });

    const goatUser = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .findOne({}, { sort: { points: "desc" } });

    if (goatUser.id === randomUser.id) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        message: "🎉 We have a GOAT winner!",
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
      await sendVideoWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        videoPath: path.resolve(__dirname, "assets", "goat.mp4"),
        options: {
          caption: `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today! 🐐🐐🐐`,
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
    } else {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        message: `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today!`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
    }

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `📈 [${randomUser.name}](tg://user?id=${
        randomUser.id
      }) now has ${randomUser.points + 1} points!`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } catch (error) {
    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `❌ Something went wrong... ${String(error)}`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } finally {
    await client.close();
  }
});

bot.onText(/^\/top/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  try {
    await client.connect();

    const users = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .find({}, { sort: { points: "desc" } })
      .toArray();

    if (users.length === 0) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: message.chat.id,
        message: "No participants yet!",
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
      return;
    }

    const messages = ["*Ranking:*"].concat(
      users.map(
        (user, index) =>
          `${index + 1}. [${user.name}](tg://user?id=${user.id}) - ${
            user.points
          } points`
      )
    );

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: messages.join("\n"),
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } catch (error) {
    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: message.chat.id,
      message: `❌ Something went wrong... ${String(error)}`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } finally {
    await client.close();
  }
});

bot.onText(/^\/ping/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  bot.sendMessage(message.chat.id, "Pong!");
});

bot.onText(/^\/progress/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st of the current year
  const endOfYear = new Date(now.getFullYear() + 1, 0, 1); // January 1st of the next year

  const totalDays = (endOfYear - startOfYear) / (1000 * 60 * 60 * 24); // Total days in the year
  const daysPassed = (now - startOfYear) / (1000 * 60 * 60 * 24); // Days passed so far

  const progress = ((daysPassed / totalDays) * 100).toFixed(5); // Percentage rounded to 2 decimal places

  const diffTime = endOfYear - now;
  const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  bot.sendMessage(
    message.chat.id,
    `Year Progress: ${progress}%\nDays Left: ${remainingDays}`
  );
});

bot.onText(/^\/schedule/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  try {
    const today = new Date();

    const schedule = ["*Games Schedule:*"];

    // Show next 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const game = getTodaysGame(date);
      const formattedDate = date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      schedule.push(`${formattedDate}: ${game.name}`);
    }

    await sendMessageWithRetryAndDelay({
      bot,
      chatId: message.chat.id,
      message: schedule.join("\n"),
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  } catch (error) {
    await sendMessageWithRetryAndDelay({
      bot,
      chatId: message.chat.id,
      message: `❌ Something went wrong... ${String(error)}`,
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });
  }
});

bot.setMyCommands([
  {
    command: "/register",
    description: "Register to the game",
  },
  {
    command: "/lucky",
    description: "Try your luck",
  },
  {
    command: "/top",
    description: "Get the top participants",
  },
  {
    command: "/ping",
    description: "Ping the bot",
  },
  {
    command: "/progress",
    description: "Get year's progress",
  },
  {
    command: "/schedule",
    description: "Get the games schedule",
  },
]);
