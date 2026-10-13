import {
  AdminTeamData,
  News,
  OtherOpportunities,
  ProgrammingAreas,
  Projects,
  Publications,
  StaffTeamData,
  TopOpportunities,
} from "./legacyData";
import ContentItem, { ContentKind, ContentItemType } from "../models/contentItem";
import Program from "../models/program";
import Project from "../models/project";
import StaffProfile from "../models/staffProfile";

type LegacyContent = Omit<ContentItemType, "postedBy" | "approved" | "kind">;

const contentSeeds: { kind: ContentKind; entries: LegacyContent[] }[] = [
  {
    kind: "program",
    entries: ProgrammingAreas.map((program) => ({
      legacyKey: `program-${program.project}`,
      title: program.title,
      description: program.description,
      category: program.project,
      image: program.image,
    })),
  },
  {
    kind: "project",
    entries: Projects.map((project) => ({
      legacyKey: `project-${project.id}`,
      title: project.title,
      category: project.category,
      status: project.status,
      context: project.context,
      description: project.context,
      summary: project.desc,
      image: project.image,
    })),
  },
  {
    kind: "news",
    entries: News.map((news) => ({
      legacyKey: `news-${news.id}`,
      title: news.title,
      description: news.content,
      publisher: news.publisher,
      date: new Date(news.date),
    })),
  },
  {
    kind: "opportunity",
    entries: [...TopOpportunities, ...OtherOpportunities].map((opportunity, index) => ({
      legacyKey: `opportunity-${index + 1}`,
      title: opportunity.title,
      description: opportunity.desc,
      status: opportunity.status,
      image: opportunity.image,
      link: opportunity.link,
      location: opportunity.location,
      type: opportunity.type,
      deadline: opportunity.deadline,
    })),
  },
  {
    kind: "publication",
    entries: Publications.map((publication) => ({
      legacyKey: `publication-${publication.id}`,
      title: publication.title,
      description: publication.desc,
      summary: publication.desc,
      type: publication.text,
    })),
  },
  {
    kind: "report",
    entries: [
      {
        legacyKey: "report-flagship-ai-civic-engagement",
        title: "Technology, Artificial Intelligence and Civic Engagement in Africa",
        description: "Practices and an emerging framework — BBYDI's own research, launched to national press in Abuja.",
        date: new Date("2026-05-01T00:00:00Z"),
        category: "Research report",
      },
      {
        legacyKey: "report-ai-civic-engagement-brief",
        title: "Why AI-Supported Civic Technologies Are Not Yet Transforming Participation",
        description: "Companion brief to BBYDI's research on technology, artificial intelligence and civic engagement in Africa.",
        date: new Date("2026-05-01T00:00:00Z"),
        category: "Policy brief",
      },
    ],
  },
];

export const migrateLegacyContent = async (): Promise<void> => {
  await Promise.all([ContentItem.init(), StaffProfile.init()]);

  const [legacyPrograms, legacyProjects] = await Promise.all([
    Program.find({ isDeleted: { $ne: true } }).populate("postedBy", "name email"),
    Project.find({ isDeleted: { $ne: true } }).populate("postedBy", "name email"),
  ]);

  for (const program of legacyPrograms) {
    const legacyKey = `database-program-${program._id}`;
    await ContentItem.updateOne(
      { kind: "program", $or: [{ legacyKey }, { title: program.title }] },
      {
        $setOnInsert: {
          kind: "program",
          legacyKey,
          sortOrder: 0,
          title: program.title,
          description: program.description,
          category: program.category,
          image: program.image ?? undefined,
          approved: program.approved,
          postedBy: program.postedBy,
        },
      },
      { upsert: true },
    );
  }

  for (const project of legacyProjects) {
    const legacyKey = `database-project-${project._id}`;
    await ContentItem.updateOne(
      { kind: "project", $or: [{ legacyKey }, { title: project.title }] },
      {
        $setOnInsert: {
          kind: "project",
          legacyKey,
          sortOrder: 0,
          title: project.title,
          description: project.description,
          context: project.description,
          category: project.category,
          image: project.image ?? undefined,
          approved: project.approved,
          postedBy: project.postedBy,
        },
      },
      { upsert: true },
    );
  }

  for (const seed of contentSeeds) {
    if (seed.entries.length === 0) continue;
    await ContentItem.bulkWrite(seed.entries.map((entry, index) => ({
      updateOne: {
        filter: { kind: seed.kind, $or: [{ legacyKey: entry.legacyKey }, { title: entry.title }] },
        update: { $setOnInsert: { ...entry, sortOrder: index + 1, kind: seed.kind, approved: true } },
        upsert: true,
      },
    })));
  }

  const staffEntries = [
    ...AdminTeamData.map((person, index) => ({ person, category: "leadership" as const, key: `legacy-leadership-${index + 1}` })),
    ...StaffTeamData.map((person, index) => ({ person, category: "staff" as const, key: `legacy-staff-${index + 1}` })),
  ];
  await StaffProfile.bulkWrite(staffEntries.map(({ person, category, key }) => ({
    updateOne: {
      filter: { legacyKey: key },
      update: {
        $setOnInsert: {
          legacyKey: key,
          name: person.name,
          position: person.role,
          image: person.image,
          category,
          active: true,
        },
      },
      upsert: true,
    },
  })));
};
