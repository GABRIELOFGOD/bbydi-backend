import { Request, Response } from "express";
import ContactSubmission from "../models/contactSubmission";
import { catchAsync } from "../utils/catchAsync";
import { responder } from "../utils/helper";
import HTTP_STATUS from "../utils/statusCode";
import { isValidEmail } from "../utils/customValidators";
import { UserRole } from "../utils/types";
import { notifyAdmins } from "../utils/notifications";

const isAdmin = (req: Request): boolean => req.user?.role === UserRole.ADMIN;

export const submitContact = catchAsync(async (req: Request, res: Response) => {
  const { name, organization, email, writingAs, message } = req.body;
  if (!name || !organization || !email || !writingAs || !message || !isValidEmail(email)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please complete all fields with a valid email address");
  }

  const submission = await ContactSubmission.create({
    name,
    organization,
    email,
    writingAs,
    message,
  });
  await notifyAdmins({
    category: "contact",
    title: "New contact message",
    message: `${name} sent a message as ${writingAs}.`,
    href: "/dashboard/contact",
    read: false,
  });

  return res.status(HTTP_STATUS.CREATED).json({ message: "Message sent successfully", data: submission });
});

export const getContactSubmissions = catchAsync(async (req: Request, res: Response) => {
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can view contact messages");
  const submissions = await ContactSubmission.find().sort({ createdAt: -1 });
  return res.status(HTTP_STATUS.OK).json(submissions);
});

export const updateContactStatus = catchAsync(async (req: Request, res: Response) => {
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can update contact messages");
  const { status } = req.body;
  if (status !== "new" && status !== "handled") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Status must be new or handled");
  }

  const submission = await ContactSubmission.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true },
  );
  if (!submission) return responder(res, HTTP_STATUS.NOT_FOUND, "Contact message not found");
  return res.status(HTTP_STATUS.OK).json({ message: "Contact message updated", data: submission });
});

export const deleteContactSubmission = catchAsync(async (req: Request, res: Response) => {
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can delete contact messages");
  const submission = await ContactSubmission.findByIdAndDelete(req.params.id);
  if (!submission) return responder(res, HTTP_STATUS.NOT_FOUND, "Contact message not found");
  return res.status(HTTP_STATUS.OK).json({ message: "Contact message deleted" });
});
