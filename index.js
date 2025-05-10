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
  shuffleUsers,
} from "./utils.js";
import { getTodaysGame } from "./games.js";
import { findMissingResults } from "./find-missing-results.js";
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

// Command lock mechanism
const commandLocks = new Map();

async function acquireLock(chatId) {
  if (commandLocks.get(chatId)) {
    return false;
  }
  commandLocks.set(chatId, true);
  return true;
}

function releaseLock(chatId) {
  commandLocks.delete(chatId);
}

async function executeCommand(message, commandFn) {
  if (!isMessageFromPerson(message)) return;

  const chatId = message.chat.id;
  const lockAcquired = await acquireLock(chatId);

  if (!lockAcquired) {
    bot.sendMessage(
      chatId,
      "⏳ Another command is being processed. Please wait...",
      {
        parse_mode: "Markdown",
        disable_notification: true,
      }
    );
    return;
  }

  try {
    await commandFn();
  } finally {
    releaseLock(chatId);
  }
}

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
  executeCommand(message, async () => {
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

      const users = shuffleUsers(
        await client
          .db(message.chat.id.toString())
          .collection("participants")
          .find({})
          .toArray()
      ).filter((user) => user.name !== "YuraCh" && user.name !== "makonix");

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
});

bot.onText(/^\/top/, async (message) => {
  executeCommand(message, async () => {
    if (!isMessageFromPerson(message)) return;

    try {
      await client.connect();

      const users = (
        await client
          .db(message.chat.id.toString())
          .collection("participants")
          .find({}, { sort: { points: "desc" } })
          .toArray()
      ).filter((user) => user.name !== "YuraCh" && user.name !== "makonix");

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
});

bot.onText(/^\/ping/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  bot.sendMessage(message.chat.id, "Pong!");
});

bot.onText(/^\/progress/, async (message) => {
  executeCommand(message, async () => {
    if (!isMessageFromPerson(message)) return;

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st of the current year
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1); // January 1st of the next year

    const totalDays = (endOfYear - startOfYear) / (1000 * 60 * 60 * 24); // Total days in the year
    const daysPassed = (now - startOfYear) / (1000 * 60 * 60 * 24); // Days passed so far

    const progress = ((daysPassed / totalDays) * 100).toFixed(5); // Percentage rounded to 2 decimal places

    const diffTime = endOfYear - now;
    const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    await sendMessageWithRetryAndDelay({
      bot,
      chatId: message.chat.id,
      message: `Year Progress: ${progress}%\nDays Left: ${remainingDays}`,
      options: {
        parse_mode: "Markdown",
      },
    });
  });
});

bot.onText(/^\/schedule/, async (message) => {
  executeCommand(message, async () => {
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
});

bot.onText(/^\/missing/, async (message) => {
  executeCommand(message, async () => {
    if (!isMessageFromPerson(message)) return;

    try {
      await client.connect();

      const database = client.db(message.chat.id.toString());
      const resultsCollection = database.collection("results");
      const missingResults = await findMissingResults(resultsCollection);

      if (missingResults.length === 0) {
        await sendMessageWithRetryAndDelay({
          bot,
          chatId: message.chat.id,
          message: "No missing results found!",
          options: {
            parse_mode: "Markdown",
            disable_notification: true,
          },
        });
        return;
      }

      // List all missing dates
      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `📅 *Missing dates found:*\n${missingResults
          .map((date) => `• ${date}`)
          .join("\n")}`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      const firstMissingDate = missingResults[0];
      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `🎯 *Selected date for execution:* ${firstMissingDate}`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      // Get all participants
      const users = shuffleUsers(
        await database.collection("participants").find({}).toArray()
      ).filter((user) => user.name !== "YuraCh" && user.name !== "makonix");

      if (users.length === 0) {
        await sendMessageWithRetryAndDelay({
          bot,
          chatId: message.chat.id,
          message: "No participants found!",
          options: {
            parse_mode: "Markdown",
            disable_notification: true,
          },
        });
        return;
      }

      // List all participants and their current points
      const participantsList = ["👥 *Current participants and points:*"].concat(
        users.map(
          (user) =>
            `• [${user.name}](tg://user?id=${user.id}) - ${user.points} points`
        )
      );

      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: participantsList.join("\n"),
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      // Parse the missing date and get the game
      const [day, month, year] = firstMissingDate.split(".");
      const gameDate = new Date(year, month - 1, day);
      const game = getTodaysGame(gameDate);

      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `🎮 *Game for ${firstMissingDate}:* ${game.name}`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      // Execute the game
      const randomUser = await game.playFn({
        bot,
        users,
        chatId: message.chat.id,
      });

      // Update points and save result
      await database
        .collection("participants")
        .updateOne({ id: randomUser.id }, { $inc: { points: 1 } });

      await database.collection("results").insertOne({
        date: firstMissingDate,
        winner: randomUser,
      });

      // Announce the winner and their new points
      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `🏆 *Winner:* [${randomUser.name}](tg://user?id=${
          randomUser.id
        })\n📈 *New points:* ${randomUser.points + 1}`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });

      // Get updated points for all participants
      const updatedUsers = await database
        .collection("participants")
        .find({}, { sort: { points: "desc" } })
        .toArray();

      // Show final points table
      const finalPointsList = ["📊 *Final points after update:*"].concat(
        updatedUsers.map(
          (user, index) =>
            `${index + 1}. [${user.name}](tg://user?id=${user.id}) - ${
              user.points
            } points`
        )
      );

      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: finalPointsList.join("\n"),
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
    } catch (error) {
      await sendMessageWithRetryAndDelay({
        bot,
        chatId: message.chat.id,
        message: `❌ Error: ${error.message}`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
    } finally {
      await client.close();
    }
  });
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
  {
    command: "/missing",
    description: "Get missing results",
  },
]);
