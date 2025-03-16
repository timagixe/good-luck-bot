/**
 * @param {import("node-telegram-bot-api").Message} message
 */
export function isMessageFromPerson(message) {
  return message.from && !message.from.is_bot;
}

export function getTodayDate() {
  return new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
}

async function wait(ms = 3000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendMessageWithRetryAndDelay({
  bot,
  chatId,
  message,
  options,
}) {
  await wait();
  return withRetry(() => bot.sendMessage(chatId, message, options));
}
