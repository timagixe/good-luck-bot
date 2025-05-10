export async function findWinnerDates(resultsCollection) {
  try {
    // Get all dates from 2025 up to today
    const startDate = new Date("2025-01-01");
    const endDate = new Date(); // Use today as end date
    const allDates = [];

    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      allDates.push(`${day}.${month}.${year}`);
    }

    // Get all results where YuraCh or makonix were winners
    const winningResults = await resultsCollection
      .find({
        $or: [
          { "winner.name": "YuraCh" },
          { "winner.name": "makonix" }
        ],
        date: {
          $regex: "^\\d{2}\\.\\d{2}\\.2025$",
        },
      })
      .toArray();

    // Create a map of dates and their winners
    const winningDates = winningResults.map(result => ({
      date: result.date,
      winner: result.winner
    }));

    return winningDates;
  } catch (error) {
    console.error("Error finding winner dates:", error);
    throw error;
  }
}
