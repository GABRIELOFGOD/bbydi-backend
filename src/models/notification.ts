import mongoose, { Model, Schema } from "mongoose";

export type NotificationType = {
  recipient: mongoose.Types.ObjectId;
  category: "contact" | "content" | "approval";
  title: string;
  message: string;
  href: string;
  read: boolean;
};

const NotificationSchema = new Schema<NotificationType>({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  category: { type: String, enum: ["contact", "content", "approval"], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  href: { type: String, required: true },
  read: { type: Boolean, default: false },
}, { timestamps: true });

const Notification: Model<NotificationType> =
  mongoose.models.Notification ?? mongoose.model<NotificationType>("Notification", NotificationSchema);

export default Notification;
