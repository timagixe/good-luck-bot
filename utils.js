/**
 * @param {import("node-telegram-bot-api").Message} message
 */
export function isMessageFromPerson(message) {
    return message.from && !message.from.is_bot;
}
