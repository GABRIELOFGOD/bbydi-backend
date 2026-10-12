import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL!);
    console.log("Database connected successfully");
  } catch (error) {
    console.error("Error connecting to database", error);
    throw error;
  }
};