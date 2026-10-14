import mongoose, { Model, Schema } from "mongoose";

export const CONTENT_KINDS = [
  "program",
  "project",
  "news",
  "blog",
  "opportunity",
  "report",
  "publication",
  "partner",
] as const;

export type ContentKind = typeof CONTENT_KINDS[number];

export type ContentItemType = {
  kind: ContentKind;
  legacyKey?: string;
  slug?: string;
  sortOrder?: number;
  title: string;
  description?: string;
  context?: string;
  summary?: string;
  category?: string;
  status?: string;
  image?: string;
  imageCaption?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageAlignment?: "left" | "center" | "right";
  featured?: boolean;
  link?: string;
  location?: string;
  type?: string;
  deadline?: string;
  publisher?: string;
  authorRole?: string;
  readingTime?: string;
  wordCount?: number;
  tags?: string[];
  sourceUrl?: string;
  date?: Date;
  document?: string;
  approved: boolean;
  postedBy?: mongoose.Types.ObjectId;
  isDeleted?: boolean;
};

const ContentItemSchema = new Schema<ContentItemType>({
  kind: { type: String, enum: CONTENT_KINDS, required: true },
  legacyKey: String,
  slug: { type: String, trim: true },
  sortOrder: Number,
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  context: String,
  summary: String,
  category: String,
  status: String,
  image: String,
  imageCaption: String,
  imageAlt: String,
  imageWidth: { type: Number, min: 25, max: 100, default: 100 },
  imageAlignment: { type: String, enum: ["left", "center", "right"], default: "center" },
  featured: { type: Boolean, default: false },
  link: String,
  location: String,
  type: String,
  deadline: String,
  publisher: String,
  authorRole: String,
  readingTime: String,
  wordCount: Number,
  tags: [String],
  sourceUrl: String,
  date: Date,
  document: String,
  approved: { type: Boolean, default: false },
  postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  isDeleted: { type: Boolean, default: false, select: false },
}, { timestamps: true });

ContentItemSchema.index(
  { kind: 1, legacyKey: 1 },
  { unique: true, partialFilterExpression: { legacyKey: { $type: "string" } } },
);
ContentItemSchema.index(
  { kind: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } },
);

const ContentItem: Model<ContentItemType> =
  mongoose.models.ContentItem ?? mongoose.model<ContentItemType>("ContentItem", ContentItemSchema);

export default ContentItem;
