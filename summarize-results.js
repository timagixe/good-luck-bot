import { MongoClient, ServerApiVersion } from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const client = new MongoClient(
  `CONNECTION_URI_STRING`,
  {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }
);

async function getAllData() {
  try {
    await client.connect();

    const database = client.db("DB_NAME");
    const collection = database.collection("COLUMN_NAME");

    const data = await collection.find({}).toArray();

    return data;
  } catch (error) {
    console.error("Error fetching data:", error);
    throw error;
  } finally {
    await client.close();
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function convertToCSV(data) {
  const usersSet = new Set();
  const datesSet = new Set();

  // Collect all users and dates
  data.forEach((item) => {
    usersSet.add(item.winner.name);
    datesSet.add(item.date);
  });

  const users = Array.from(usersSet).sort();
  const dates = Array.from(datesSet)
    .map((date) => new Date(date.split(".").reverse().join("-")))
    .sort((a, b) => a - b)
    .map((date) => {
      const day = date.getDate().toString().padStart(2, "0");
      const month = (date.getMonth() + 1).toString().padStart(2, "0");
      const year = date.getFullYear();
      return `${day}.${month}.${year}`;
    });

  // Prepare a cumulative points map
  const pointsMap = {};
  users.forEach((user) => {
    pointsMap[user] = {};
    dates.forEach((date) => {
      pointsMap[user][date] = 0;
    });
  });

  // Accumulate points
  data.forEach((item) => {
    const user = item.winner.name;
    const date = item.date;
    pointsMap[user][date] += 1;
  });

  // Make points cumulative over dates
  users.forEach((user) => {
    let cumulativePoints = 0;
    dates.forEach((date) => {
      cumulativePoints += pointsMap[user][date];
      pointsMap[user][date] = cumulativePoints;
    });
  });

  // Prepare CSV header
  let csv = ["username," + dates.join(",")];

  // Create rows for each user
  users.forEach((user) => {
    const row = [user];

    dates.forEach((date) => {
      row.push(pointsMap[user][date]);
    });

    csv.push(row.join(","));
  });

  return csv.join("\n");
}

async function saveDataToFile() {
  try {
    const data = await getAllData();

    const filePath = path.join(__dirname, "results.csv");
    fs.writeFileSync(filePath, convertToCSV(data));

    console.log(`Data saved to ${filePath}`);
  } catch (error) {
    console.error("Error saving data to file:", error);
  }
}

saveDataToFile();
