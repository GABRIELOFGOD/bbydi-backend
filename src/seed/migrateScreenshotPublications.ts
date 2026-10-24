import ContentItem from "../models/contentItem";
import { ScreenshotPublications } from "./legacyData";

export const migrateScreenshotPublications = async (): Promise<void> => {
  await ContentItem.init();
  const entries = ScreenshotPublications.map((publication, index) => ({
    kind: "publication" as const,
    legacyKey: `publication-${publication.id}`,
    title: publication.title,
    description: publication.desc,
    summary: publication.desc,
    category: publication.type,
    type: publication.type,
    theme: publication.theme,
    language: "English",
    date: new Date(`${publication.date}T00:00:00Z`),
    featured: publication.featured ?? false,
    sortOrder: index + 1,
    approved: true,
  }));
  await ContentItem.bulkWrite(entries.map((entry) => ({
    updateOne: {
      filter: { kind: "publication", $or: [{ legacyKey: entry.legacyKey }, { title: entry.title }] },
      update: { $setOnInsert: entry },
      upsert: true,
    },
  })));
  const titles = entries.map(({ title }) => title);
  const importedCount = await ContentItem.countDocuments({ kind: "publication", title: { $in: titles } });
  if (importedCount !== entries.length) {
    throw new Error(`Publication migration found ${importedCount} of ${entries.length} screenshot publications`);
  }
  console.log(`Publication migration complete: ${importedCount} of ${entries.length} screenshot publications are present.`);
};
