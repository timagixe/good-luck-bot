/**
 * @param {import("node-telegram-bot-api").Message} message
 */
export function isMessageFromPerson(message) {
    return message.from && !message.from.is_bot;
}

export function getTodayDate() {
    return new Date().toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" });
}

export function isLastDayOfMonth(date) {
    const tomorrow = new Date(date);
    tomorrow.setDate(date.getDate() + 1);
    return tomorrow.getMonth() !== date.getMonth();
}
