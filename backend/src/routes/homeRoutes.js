const express = require("express");
const homeController = require("../controllers/homeController");

const router = express.Router();

router.get("/health", homeController.getApiStatus);

module.exports = router;
