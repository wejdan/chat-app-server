const mongoose = require("mongoose");

const connectDatabase = async () => {
  try {
    await mongoose.connect(
      `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.d3hxgrk.mongodb.net/${process.env.DB_NAME}?retryWrites=true&w=majority`,
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    );
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Could not connect to MongoDB...", error);
    throw error; // Throw the error to be handled where connectDatabase is called
  }
};

module.exports = connectDatabase;
