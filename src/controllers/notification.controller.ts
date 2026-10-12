import { Request, Response } from "express";
import Notification from "../models/notification";
import { catchAsync } from "../utils/catchAsync";
import { responder } from "../utils/helper";
import HTTP_STATUS from "../utils/statusCode";

export const getNotifications = catchAsync(async (req: Request, res: Response) => {
  const notifications = await Notification.find({ recipient: req.user?._id }).sort({ createdAt: -1 });
  return res.status(HTTP_STATUS.OK).json(notifications);
});

export const markNotificationRead = catchAsync(async (req: Request, res: Response) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user?._id },
    { read: true },
    { new: true },
  );
  if (!notification) return responder(res, HTTP_STATUS.NOT_FOUND, "Notification not found");
  return res.status(HTTP_STATUS.OK).json({ message: "Notification marked as read", data: notification });
});
