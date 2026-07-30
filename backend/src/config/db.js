import pg from 'pg';
const { Pool } = pg;

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

export {
  pool,
  connectDatabase
};
