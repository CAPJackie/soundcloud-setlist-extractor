import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI env var is not set");

let client: MongoClient;
let db: Db;

declare global {
  // Persist connection across hot reloads in dev
  // eslint-disable-next-line no-var
  var _mongoClient: MongoClient | undefined;
}

export async function getDb(): Promise<Db> {
  if (db) return db;

  if (global._mongoClient) {
    client = global._mongoClient;
  } else {
    client = new MongoClient(uri!, { connectTimeoutMS: 5000, serverSelectionTimeoutMS: 5000 });
    await client.connect();
    if (process.env.NODE_ENV !== "production") global._mongoClient = client;
  }

  db = client.db("soundcloud_setlist");
  return db;
}
