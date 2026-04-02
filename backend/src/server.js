require("dotenv").config();
const express = require("express");
const homeRoutes = require("./routes/homeRoutes");

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

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
