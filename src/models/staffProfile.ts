import mongoose, { Model, Schema } from "mongoose";

export type StaffProfileType = {
  legacyKey?: string;
  name: string;
  position: string;
  image?: string;
  category: "leadership" | "staff";
  active: boolean;
};

const StaffProfileSchema = new Schema<StaffProfileType>({
  legacyKey: String,
  name: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  image: String,
  category: { type: String, enum: ["leadership", "staff"], default: "staff" },
  active: { type: Boolean, default: true },
}, { timestamps: true });

StaffProfileSchema.index(
  { legacyKey: 1 },
  { unique: true, partialFilterExpression: { legacyKey: { $type: "string" } } },
);

const StaffProfile: Model<StaffProfileType> =
  mongoose.models.StaffProfile ?? mongoose.model<StaffProfileType>("StaffProfile", StaffProfileSchema);

export default StaffProfile;
