export async function findMissingResults(resultsCollection) {
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

    // Get all existing results from 2025 up to today
    const existingResults = await resultsCollection
      .find({
        date: {
          $regex: "^\\d{2}\\.\\d{2}\\.2025$",
        },
      })
      .toArray();

    const existingDates = new Set(existingResults.map((result) => result.date));

    // Find missing dates
    const missingDates = allDates.filter((date) => !existingDates.has(date));

    return missingDates;
  } catch (error) {
    console.error("Error finding missing results:", error);
    throw error;
  }
}
