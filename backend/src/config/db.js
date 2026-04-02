const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables.");
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

const connectDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query("SELECT NOW()");
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  connectDatabase
};
