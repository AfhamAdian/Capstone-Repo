require("dotenv").config();
const express = require("express");
const homeRoutes = require("./routes/homeRoutes");
const { connectDatabase } = require("./config/db");

const apiVersion = process.env.API_VERSION || "v1";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(`/api/${apiVersion}`, homeRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

const PORT = process.env.API_PORT || process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDatabase();
    console.log("Connected to Supabase PostgreSQL");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to connect to database:", error.message);
    process.exit(1);
  }
};

startServer();
