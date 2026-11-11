const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/leave-management";

    await mongoose.connect(MONGO_URI);

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.log("MongoDB connection failed:", error);
    process.exit(1);
  }
};
module.exports = connectDB;
