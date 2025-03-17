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

  if (gameType === "darts") {
    switch (diceResult.dice.value) {
      case 1:
        return `${emoji} [${user.name}](tg://user?id=${user.id}) misses!`;
      default:
        return `${emoji} [${user.name}](tg://user?id=${user.id}) scores ${diceResult.dice.value}!`;
    }
  }

  if (gameType === "bowling") {
    switch (diceResult.dice.value) {
      case 1:
        return `${emoji} [${user.name}](tg://user?id=${user.id}) misses!`;
      default:
        return `${emoji} [${user.name}](tg://user?id=${user.id}) scores ${diceResult.dice.value}!`;
    }
  }

  if (gameType === "basketball") {
    return diceResult.dice.value >= 4
      ? `${emoji} [${user.name}](tg://user?id=${user.id}) scores!`
      : `${emoji} [${user.name}](tg://user?id=${user.id}) misses!`;
  }

  if (gameType === "football") {
    return diceResult.dice.value >= 3
      ? `${emoji} [${user.name}](tg://user?id=${user.id}) scores!`
      : `${emoji} [${user.name}](tg://user?id=${user.id}) misses!`;
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

    console.log("--------------------------------");
    console.log(`TIME - ${new Date().toISOString()}`);
    console.log(`PLAYED GAME - ${gameType}`);
    console.log(`USER - ${user.name}`);
    console.log(`DICE RESULT - ${diceResult.dice.value}`);

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

  // value - higher is better
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

async function getWinnerFromDiceGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playDiceOnBehalfOfUsers({ bot, chatId, users: winners });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `${gameTypeToEmoji["dice"]} We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Playing again for them...`,
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

async function playDartsOnBehalfOfUsers({ users, bot, chatId }) {
  const usersResults = await playGameOnBehalfOfUsers({
    users,
    bot,
    chatId,
    gameType: "darts",
  });

  // value = 1 - missed
  // value >= 2 - scores points
  // value - higher is better
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

async function getWinnerFromDartsGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playDartsOnBehalfOfUsers({ bot, chatId, users: winners });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `${gameTypeToEmoji["darts"]} We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Playing again for them...`,
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

async function playBowlingOnBehalfOfUsers({ users, bot, chatId }) {
  const usersResults = await playGameOnBehalfOfUsers({
    users,
    bot,
    chatId,
    gameType: "bowling",
  });

  // value = 1 - missed
  // value >= 2 - scores points
  // value - higher is better
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

async function getWinnerFromBowlingGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playBowlingOnBehalfOfUsers({ bot, chatId, users: winners });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `${gameTypeToEmoji["bowling"]} We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Playing again for them...`,
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

async function playBasketballOnBehalfOfUsers({ users, bot, chatId }) {
  const usersResults = await playGameOnBehalfOfUsers({
    users,
    bot,
    chatId,
    gameType: "basketball",
  });

  // value = 1 - missed
  // value = 2 - missed
  // value = 3 - missed
  // value = 4 - scores points
  // value = 5 - scores points
  const minValueToScore = 4;

  const winnersMap = new Map();

  for (const [userName, value] of usersResults.entries()) {
    if (value >= minValueToScore) {
      const user = users.find((u) => u.name === userName);

      winnersMap.set(userName, user);
    }
  }

  const usersWithPoints = users.filter((user) => winnersMap.has(user.name));

  // returns all users if no one scored points
  return usersWithPoints.length === 0 ? users : usersWithPoints;
}

async function getWinnerFromBasketballGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playBasketballOnBehalfOfUsers({
      bot,
      chatId,
      users: winners,
    });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `${
          gameTypeToEmoji["basketball"]
        } We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Playing again for them...`,
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

async function playFootballOnBehalfOfUsers({ users, bot, chatId }) {
  const usersResults = await playGameOnBehalfOfUsers({
    users,
    bot,
    chatId,
    gameType: "football",
  });

  // value = 1 - missed
  // value = 2 - missed
  // value = 3 - scores points
  // value = 4 - scores points
  // value = 5 - scores points
  const minValueToScore = 3;

  const winnersMap = new Map();

  for (const [userName, value] of usersResults.entries()) {
    if (value >= minValueToScore) {
      const user = users.find((u) => u.name === userName);

      winnersMap.set(userName, user);
    }
  }

  const usersWithPoints = users.filter((user) => winnersMap.has(user.name));

  // returns all users if no one scored points
  return usersWithPoints.length === 0 ? users : usersWithPoints;
}

async function getWinnerFromFootballGame({ users, chatId, bot }) {
  let winners = users;

  while (winners.length > 1) {
    winners = await playFootballOnBehalfOfUsers({
      bot,
      chatId,
      users: winners,
    });

    if (winners.length > 1) {
      await sendMessageWithRetryAndDelay({
        bot: bot,
        chatId: chatId,
        message: `${gameTypeToEmoji["football"]} We have a tie between ${winners
          .map((user) => `[${user.name}](tg://user?id=${user.id})`)
          .join(", ")}! Playing again for them...`,
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

const GAMES_FUNCTIONS = {
  darts: {
    name: "Darts",
    playFn: getWinnerFromDartsGame,
  },
  bowling: {
    name: "Bowling",
    playFn: getWinnerFromBowlingGame,
  },
  basketball: {
    name: "Basketball",
    playFn: getWinnerFromBasketballGame,
  },
  football: {
    name: "Football",
    playFn: getWinnerFromFootballGame,
  },
  dice: {
    name: "Dice",
    playFn: getWinnerFromDiceGame,
  },
};

export function getTodaysGame(today = new Date()) {
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((today - startOfYear) / (24 * 60 * 60 * 1000));

  const gamesList = Object.keys(GAMES_FUNCTIONS);
  const todaysGameIndex = dayOfYear % gamesList.length;
  const todaysGame = gamesList[todaysGameIndex];

  return GAMES_FUNCTIONS[todaysGame];
}
