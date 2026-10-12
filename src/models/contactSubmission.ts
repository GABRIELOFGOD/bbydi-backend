import mongoose, { Model, Schema } from "mongoose";

export type ContactSubmissionType = {
  name: string;
  organization: string;
  email: string;
  writingAs: string;
  message: string;
  status: "new" | "handled";
};

const ContactSubmissionSchema = new Schema<ContactSubmissionType>({
  name: { type: String, required: true, trim: true },
  organization: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  writingAs: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ["new", "handled"], default: "new" },
}, { timestamps: true });

const ContactSubmission: Model<ContactSubmissionType> =
  mongoose.models.ContactSubmission ??
  mongoose.model<ContactSubmissionType>("ContactSubmission", ContactSubmissionSchema);

export default ContactSubmission;
