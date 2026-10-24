import ContentItem from "../models/contentItem";
import DataMigration from "../models/dataMigration";

const migrationKey = "publish-screenshot-innovation-tools-v1";

const innovationTools = [
  {
    legacyKey: "innovation-my-ai-fact-checker",
    title: "MyAIFactChecker",
    description: "AI-powered WhatsApp chatbot for real-time fact-checking in seven languages.",
    type: "Live",
  },
  {
    legacyKey: "innovation-hersafespace",
    title: "HerSafeSpace (KEMI)",
    description: "AI chatbot supporting survivors of online gender-based violence.",
    type: "Live",
  },
  {
    legacyKey: "innovation-youthgovtracka",
    title: "YouthGovTracka",
    description: "Tracks the campaign promises of all 36 state governors.",
    link: "https://youthgovtracka.org",
  },
  {
    legacyKey: "innovation-yvote-naija",
    title: "YVote Naija",
    description: "Voter education and civic mobilisation platform.",
    link: "https://yvotenaija.org",
  },
  {
    legacyKey: "innovation-safernet",
    title: "SaferNet",
    description: "Digital rights and online safety resources for students.",
    link: "https://thesafernet.org",
  },
  {
    legacyKey: "innovation-conflict-report",
    title: "Conflict Report",
    description: "Civic monitoring of conflict and insecurity.",
    link: "https://conflictreport.org",
  },
  {
    legacyKey: "innovation-ewabili-green-initiative",
    title: "Ewabili Green Initiative",
    description: "Coalition supporting women-led climate projects across Africa.",
    link: "https://ewabiligreeninitiative.org",
  },
  {
    legacyKey: "innovation-evit",
    title: "EVIT",
    description: "Election violence incident tracking.",
    link: "https://evit.ng",
  },
  {
    legacyKey: "innovation-factcheck-champ-flashcards",
    title: "FactCheck Champ Flashcards",
    description: "Gamified learning tool for spotting misinformation.",
    type: "Classroom tool",
  },
  {
    legacyKey: "innovation-climate-champs-flashcards",
    title: "Climate Champs Flashcards",
    description: "Interactive climate literacy tool for schools and communities.",
    type: "Classroom tool",
  },
  {
    legacyKey: "innovation-ai-literacy-flashcards",
    title: "AI Literacy Flashcards",
    description: "Gamified learning tool for AI literacy, built for low bandwidth.",
    type: "Classroom tool",
  },
];

export const migrateInnovationTools = async (): Promise<void> => {
  if (await DataMigration.exists({ _id: migrationKey })) return;

  await ContentItem.init();
  await ContentItem.bulkWrite(innovationTools.map((tool, index) => ({
    updateOne: {
      filter: {
        kind: "innovation",
        $or: [{ legacyKey: tool.legacyKey }, { title: tool.title }],
      },
      update: {
        $set: {
          ...tool,
          kind: "innovation",
          approved: true,
          sortOrder: index + 1,
        },
      },
      upsert: true,
    },
  })));

  await DataMigration.updateOne(
    { _id: migrationKey },
    { $setOnInsert: { completedAt: new Date() } },
    { upsert: true },
  );
};
