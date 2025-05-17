import crypto from "node:crypto";
import { withRetry } from "./retry.js";

/**
 * @param {import("node-telegram-bot-api").Message} message
 */
export function isMessageFromPerson(message) {
  return message.from && !message.from.is_bot;
}

export function getTodayDate() {
  return new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
}

export async function wait(ms = 3000) {
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

export async function sendVideoWithRetryAndDelay({
  bot,
  chatId,
  videoPath,
  options,
}) {
  await wait();
  return withRetry(() => bot.sendVideo(chatId, videoPath, options));
}

export async function sendDiceWithRetryAndDelay({bot, chatId, options}) {
  await wait();
  return withRetry(() => bot.sendDice(chatId, options));
}

export async function sendAudioWithRetryAndDelay({
  bot,
  chatId,
  audioPath,
  options,
}) {
  await wait();
  return withRetry(() => bot.sendAudio(chatId, audioPath, options));
}

/**
 * Shuffles an array of users using crypto.randomInt for randomization
 * @param {Array} users - Array of user objects to shuffle
 * @returns {Array} - Shuffled array of users
 */
export function shuffleUsers(users) {
  return users
    .map((user, _index, array) => ({
      user,
      value: crypto.randomInt(0, array.length * 64),
    }))
    .sort((a, b) => a.value - b.value)
    .map(({ user }) => user);
}
