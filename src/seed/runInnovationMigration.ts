import mongoose from "mongoose";
import { config } from "dotenv";
import { connectDB } from "../config/database";
import ContentItem from "../models/contentItem";
import { migrateInnovationTools } from "./migrateInnovationTools";

config();

const run = async (): Promise<void> => {
  try {
    await connectDB();
    await migrateInnovationTools();

    const publishedCount = await ContentItem.countDocuments({
      kind: "innovation",
      legacyKey: { $in: [
        "innovation-my-ai-fact-checker",
        "innovation-hersafespace",
        "innovation-youthgovtracka",
        "innovation-yvote-naija",
        "innovation-safernet",
        "innovation-conflict-report",
        "innovation-ewabili-green-initiative",
        "innovation-evit",
        "innovation-factcheck-champ-flashcards",
        "innovation-climate-champs-flashcards",
        "innovation-ai-literacy-flashcards",
      ] },
      approved: true,
    });
    console.log(`Published ${publishedCount} of 11 screenshot innovation entries`);
  } catch (error) {
    console.error("Innovation data migration failed", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void run();
