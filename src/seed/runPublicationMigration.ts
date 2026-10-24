import mongoose from "mongoose";
import { config } from "dotenv";
import { connectDB } from "../config/database";
import { migrateScreenshotPublications } from "./migrateScreenshotPublications";

config();

const run = async (): Promise<void> => {
  try {
    await connectDB();
    await migrateScreenshotPublications();
  } catch (error) {
    console.error("Publication migration failed", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void run();
