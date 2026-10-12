import mongoose from "mongoose";
import { UserRole } from "./types";
import User from "../models/user";
import Notification, { NotificationType } from "../models/notification";

type NotificationInput = Omit<NotificationType, "recipient">;

export const notifyAdmins = async (notification: NotificationInput): Promise<void> => {
  const admins = await User.find({ role: UserRole.ADMIN, isBlocked: false }).select("_id");
  if (admins.length === 0) return;

  await Notification.insertMany(
    admins.map((admin) => ({ ...notification, recipient: admin._id })),
  );
};

export const notifyUser = async (
  recipientId: string,
  notification: NotificationInput,
): Promise<void> => {
  await Notification.create({
    ...notification,
    recipient: new mongoose.Types.ObjectId(recipientId),
  });
};
