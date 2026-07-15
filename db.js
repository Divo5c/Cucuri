// db.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function connectDB() {
  await client.connect();
  console.log("Mit MongoDB verbunden");
  return client.db("Cucuri"); // muss zu deinem DB-Namen passen
}

module.exports = { connectDB };
