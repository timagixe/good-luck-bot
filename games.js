import {
  sendDiceWithRetryAndDelay,
  sendMessageWithRetryAndDelay,
  wait,
} from "./utils.js";

const gameTypeToEmoji = {
  dice: "🎲",
  basketball: "🏀",
  football: "⚽",
  bowling: "🎳",
  darts: "🎯",
};

function getGameTypeMessage({ gameType, user, diceResult }) {
  const emoji = gameTypeToEmoji[gameType];

  if (gameType === "dice") {
    return `${emoji} [${user.name}](tg://user?id=${user.id}) rolled ${diceResult.dice.value}`;
  }

  return `${emoji} [${user.name}](tg://user?id=${user.id}) got ${diceResult.dice.value}`;
}

async function playGameOnBehalfOfUsers({ users, bot, chatId, gameType }) {
  const usersMap = users.reduce((map, user) => {
    map.set(user.name, 0);
    return map;
  }, new Map());

  const emoji = gameTypeToEmoji[gameType];

  for (const user of users) {
    const diceResult = await sendDiceWithRetryAndDelay({
      bot: bot,
      chatId: chatId,
      options: {
        disable_notification: true,
        emoji: emoji,
      },
    });

    await sendMessageWithRetryAndDelay({
      bot: bot,
      chatId: chatId,
      message: getGameTypeMessage({ diceResult, gameType, user }),
      options: {
        parse_mode: "Markdown",
        disable_notification: true,
      },
    });

    usersMap.set(user.name, diceResult.dice.value);

    await wait();
  }

  return usersMap;
}

async function playDiceOnBehalfOfUsers({ users, bot, chatId }) {
  const usersResults = await playGameOnBehalfOfUsers({
    users,
    bot,
    chatId,
    gameType: "dice",
  });

  const maxValue = Math.max(...usersResults.values());

  const winnersMap = new Map();

  for (const [userName, value] of usersResults.entries()) {
    if (value === maxValue) {
      const user = users.find((u) => u.name === userName);

      winnersMap.set(userName, user);
    }
  }

  return users.filter((user) => winnersMap.has(user.name));
}

export async function getWinnerFromDiceGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playDiceOnBehalfOfUsers({ bot, chatId, users: winners });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `🎲 We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Rolling again for them...`,
        options: {
          parse_mode: "Markdown",
          disable_notification: true,
        },
      });
    }
  }

  await sendMessageWithRetryAndDelay({
    bot: bot,
    chatId: chatId,
    message: `🎉 And the winner is... [${winners[0].name}](tg://user?id=${winners[0].id})!`,
    options: {
      parse_mode: "Markdown",
      disable_notification: true,
    },
  });

  return winners[0];
}
