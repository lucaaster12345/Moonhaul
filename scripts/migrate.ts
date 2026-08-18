import { loadEnv } from "../server/env.js";
import { MoonhaulDatabase } from "../packages/database/index.js";

const env = loadEnv();
const database = new MoonhaulDatabase(env.DATABASE_PATH);
console.log(JSON.stringify({ ok: true, database: database.path, counts: database.counts() }, null, 2));
database.close();
