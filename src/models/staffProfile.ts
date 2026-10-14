import mongoose, { Model, Schema } from "mongoose";

export type StaffProfileType = {
  legacyKey?: string;
  name: string;
  position: string;
  image?: string;
  bio?: string;
  accountId?: mongoose.Types.ObjectId;
  category: "leadership" | "staff" | "volunteer";
  active: boolean;
  displayOrder: number;
};

const StaffProfileSchema = new Schema<StaffProfileType>({
  legacyKey: String,
  name: { type: String, required: true, trim: true },
  position: { type: String, required: true, trim: true },
  image: String,
  bio: { type: String, maxlength: 5000, default: "" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  category: { type: String, enum: ["leadership", "staff", "volunteer"], default: "staff" },
  active: { type: Boolean, default: true },
  displayOrder: { type: Number, min: 0, default: 0 },
}, { timestamps: true });

StaffProfileSchema.index(
  { legacyKey: 1 },
  { unique: true, partialFilterExpression: { legacyKey: { $type: "string" } } },
);

const StaffProfile: Model<StaffProfileType> =
  mongoose.models.StaffProfile ?? mongoose.model<StaffProfileType>("StaffProfile", StaffProfileSchema);

export default StaffProfile;
