import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { MongoClient, ServerApiVersion } from "mongodb";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import fastify from "fastify";
import { getTodayDate, isMessageFromPerson } from "./utils.js";

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
      await bot.sendMessage(
        message.chat.id,
        `[${user.name}](tg://user?id=${user.id}) is already registered!`,
        {
          parse_mode: "Markdown",
        }
      );
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

    await bot.sendMessage(
      message.chat.id,
      `[${message.from.username || message.from.first_name}](tg://user?id=${
        message.from.id
      }) successfully registered!`,
      {
        parse_mode: "Markdown",
      }
    );
  } catch (error) {
    await bot.sendMessage(message.chat.id, "Something went wrong...");
    await bot.sendMessage(message.chat.id, String(error));
  } finally {
    await client.close();
  }
});

async function selectRandomWinnerViaPlayingDiceGame({ users, chatId }) {
  async function playDiceOnBehalfOfUsers(users) {
    const usersMap = users.reduce((map, user) => {
      map.set(user.name, 0);
      return map;
    }, new Map());

    for (const user of users) {
      const dice = await bot.sendDice(chatId, {
        disable_notification: true,
      });

      await bot.sendMessage(
        chatId,
        `🎲 [${user.name}](tg://user?id=${user.id}) rolled ${dice.dice.value}`,
        {
          parse_mode: "Markdown",
          disable_notification: true,
        }
      );

      usersMap.set(user.name, dice.dice.value);

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const maxValue = Math.max(...usersMap.values());

    const winnersMap = new Map();

    for (const [userName, value] of usersMap.entries()) {
      if (value === maxValue) {
        const user = users.find((u) => u.name === userName);

        winnersMap.set(userName, user);
      }
    }

    return users.filter((user) => winnersMap.has(user.name));
  }

  let winners = users;

  while (winners.length > 1) {
    winners = await playDiceOnBehalfOfUsers(winners);

    if (winners.length > 1) {
      await bot.sendMessage(
        chatId,
        `🎲 We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Rolling again for them...`,
        {
          parse_mode: "Markdown",
          disable_notification: true,
        }
      );
    }
  }

  await bot.sendMessage(
    chatId,
    `🎉 And the winner is... [${winners[0].name}](tg://user?id=${winners[0].id})!`,
    {
      parse_mode: "Markdown",
    }
  );

  return winners[0];
}

async function selectRandomWinnerViaRandomNumber({ users, chatId }) {
  const shuffledUsers = users
    .map((user) => ({
      user,
      value: crypto.randomInt(0, users.length * 64),
    }))
    .sort((a, b) => a.value - b.value);

  const shuffledList = ["*Shuffled Participants (with random values):*"].concat(
    shuffledUsers.map(
      ({ user, value }, index) =>
        `${index + 1}. [${user.name}](tg://user?id=${user.id}) - 🎲 ${value}`
    )
  );

  await bot.sendMessage(chatId, shuffledList.join("\n"), {
    parse_mode: "Markdown",
  });

  const index = crypto.randomInt(0, shuffledUsers.length);
  const randomUser = shuffledUsers[index].user;

  await bot.sendMessage(
    chatId,
    `🎯 Selected user with index - ${index + 1} - [${
      randomUser.name
    }](tg://user?id=${randomUser.id}) (position ${index + 1})`,
    {
      parse_mode: "Markdown",
    }
  );

  return randomUser;
}

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
      await bot.sendMessage(
        message.chat.id,
        `The luck is over! [${todaysLucky.winner.name}](tg://user?id=${todaysLucky.winner.id}) got it all!`,
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }

    const users = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .find({})
      .toArray();

    if (users.length === 0) {
      await bot.sendMessage(message.chat.id, "No participants yet!", {
        parse_mode: "Markdown",
      });
      return;
    }

    await bot.sendMessage(
      message.chat.id,
      `🎯 Found ${users.length} participants in the game!`
    );

    const participantsList = ["*Participants:*"].concat(
      users.map(
        (user) =>
          `• [${user.name}](tg://user?id=${user.id}) - ${user.points} points`
      )
    );

    await bot.sendMessage(message.chat.id, participantsList.join("\n"), {
      parse_mode: "Markdown",
    });

    const randomUser = await selectRandomWinnerViaPlayingDiceGame({
      users,
      chatId: message.chat.id,
    });

    await bot.sendMessage(message.chat.id, "📊 Updating points...");

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
      await bot.sendMessage(message.chat.id, "🎉 We have a GOAT winner!");
      await bot.sendVideo(
        message.chat.id,
        path.resolve(__dirname, "assets", "goat.mp4"),
        {
          caption: `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today! 🐐🐐🐐`,
          parse_mode: "Markdown",
        }
      );
    } else {
      await bot.sendMessage(
        message.chat.id,
        `Luck is on [${randomUser.name}](tg://user?id=${randomUser.id})'s side today!`,
        {
          parse_mode: "Markdown",
        }
      );
    }

    await bot.sendMessage(
      message.chat.id,
      `📈 [${randomUser.name}](tg://user?id=${randomUser.id}) now has ${
        randomUser.points + 1
      } points!`,
      {
        parse_mode: "Markdown",
      }
    );
  } catch (error) {
    await bot.sendMessage(message.chat.id, "❌ Something went wrong...");
    await bot.sendMessage(message.chat.id, String(error));
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
      await bot.sendMessage(message.chat.id, "No participants yet!", {
        parse_mode: "Markdown",
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

    await bot.sendMessage(message.chat.id, `${messages.join("\n")}`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    await bot.sendMessage(message.chat.id, "Something went wrong...");
    await bot.sendMessage(message.chat.id, String(error));
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

bot.onText(/^\/chances/, async (message) => {
  if (!isMessageFromPerson(message)) return;

  try {
    await client.connect();

    const users = await client
      .db(message.chat.id.toString())
      .collection("participants")
      .find({})
      .toArray();

    if (users.length === 0) {
      await bot.sendMessage(message.chat.id, "No participants yet!", {
        parse_mode: "Markdown",
      });
      return;
    }

    const now = new Date();
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const remainingDays = Math.ceil((endOfYear - now) / (1000 * 60 * 60 * 24));
    const simulations = 10000;
    const winCounts = {};

    for (let sim = 0; sim < simulations; sim++) {
      const points = {
        ...users.reduce(
          (acc, user) => ({ ...acc, [user.id]: user.points }),
          {}
        ),
      };

      for (let day = 0; day < remainingDays; day++) {
        const shuffledUsers = users
          .map((user) => ({
            user,
            value: crypto.randomInt(0, users.length * 64),
          }))
          .sort((a, b) => a.value - b.value)
          .map(({ user }) => user);

        const index = crypto.randomInt(0, shuffledUsers.length);
        const randomUser = shuffledUsers[index];
        points[randomUser.id] = (points[randomUser.id] || 0) + 1;
      }

      const winner = Object.keys(points).reduce((a, b) =>
        points[a] > points[b] ? a : b
      );
      winCounts[winner] = (winCounts[winner] || 0) + 1;
    }

    const messages = [
      `*Winning Chances (Monte Carlo Simulation, 10,000 runs for ${remainingDays} remaining days):*`,
    ].concat(
      users.map(
        (user, index) =>
          `${index + 1}. [${user.name}](tg://user?id=${user.id}) - ${(
            ((winCounts[user.id] || 0) / simulations) *
            100
          ).toFixed(2)}%`
      )
    );

    await bot.sendMessage(message.chat.id, `${messages.join("\n")}`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    await bot.sendMessage(message.chat.id, "Something went wrong...");
    await bot.sendMessage(message.chat.id, String(error));
  } finally {
    await client.close();
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
    command: "/chances",
    description: "Get user's chances to win",
  },
]);
