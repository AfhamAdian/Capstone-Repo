const getApiStatus = (req, res) => {
  res.status(200).json({
    success: true,
    health : "OK",
    message: "API server is running"
  });
};


module.exports = {
    getApiStatus
    };