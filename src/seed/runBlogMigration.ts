import mongoose from "mongoose";
import { config } from "dotenv";
import { connectDB } from "../config/database";
import { migrateBlogPosts } from "./migrateBlogPosts";

config();

const run = async (): Promise<void> => {
  try {
    await connectDB();
    await migrateBlogPosts();
  } catch (error) {
    console.error("Blog seed migration failed", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void run();
