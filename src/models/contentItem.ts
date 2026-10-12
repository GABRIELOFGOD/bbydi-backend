import mongoose, { Model, Schema } from "mongoose";
import { UserType } from "./user";

export const CONTENT_KINDS = [
  "program",
  "project",
  "news",
  "opportunity",
  "report",
  "publication",
  "partner",
] as const;

export type ContentKind = typeof CONTENT_KINDS[number];

export type ContentItemType = {
  kind: ContentKind;
  legacyKey?: string;
  sortOrder?: number;
  title: string;
  description?: string;
  context?: string;
  summary?: string;
  category?: string;
  status?: string;
  image?: string;
  link?: string;
  location?: string;
  type?: string;
  deadline?: string;
  publisher?: string;
  date?: Date;
  document?: string;
  approved: boolean;
  postedBy?: UserType;
  isDeleted?: boolean;
};

const ContentItemSchema = new Schema<ContentItemType>({
  kind: { type: String, enum: CONTENT_KINDS, required: true },
  legacyKey: String,
  sortOrder: Number,
  title: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  context: String,
  summary: String,
  category: String,
  status: String,
  image: String,
  link: String,
  location: String,
  type: String,
  deadline: String,
  publisher: String,
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

const ContentItem: Model<ContentItemType> =
  mongoose.models.ContentItem ?? mongoose.model<ContentItemType>("ContentItem", ContentItemSchema);

export default ContentItem;
