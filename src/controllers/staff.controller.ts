import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { isValidEmail } from "../utils/customValidators";
import HTTP_STATUS from "../utils/statusCode";
import User from "../models/user";
import { UserRole } from "../utils/types";
import { fileUploader, responder, tokenGenerator } from "../utils/helper";
import { magicMailer } from "../utils/mailer";
import StaffProfile from "../models/staffProfile";
import mongoose from "mongoose";

export const createStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const admin = req.user;
  if (!admin) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");

  const { email, name, position, avatar } = req.body;
  if (!email || !isValidEmail(email)) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address");
  if (!name) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide staff name");

  const existingUser = await User.findOne({ email });
  if (existingUser) return responder(res, HTTP_STATUS.CONFLICT, "A staff profile with this email already exists");

  const staff = await User.create({ email, name, position, avatar, role: UserRole.STAFF, createdBy: admin });
  return res.status(HTTP_STATUS.CREATED).json({ message: "Staff profile created", user: staff });
});

export const getStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const staff = await User.find({ role: UserRole.STAFF, isBlocked: false }).select("-password -createdBy");
  return res.status(HTTP_STATUS.OK).json({ message: "Staff profiles fetched", data: staff });
});

export const getStaffAccounts = catchAsync(async (_req: Request, res: Response) => {
  const accounts = await User.find({ role: UserRole.STAFF }).select("-password -createdBy").sort({ name: 1 });
  return res.status(HTTP_STATUS.OK).json({ data: accounts });
});

export const updateStaffAccount = catchAsync(async (req: Request, res: Response) => {
  const { name, email, position, avatar, isBlocked } = req.body;
  if (email !== undefined && !isValidEmail(email)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address");
  }
  if (isBlocked !== undefined && typeof isBlocked !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Account status must be a boolean");
  }

  const account = await User.findOne({ _id: req.params.id, role: UserRole.STAFF });
  if (!account) return responder(res, HTTP_STATUS.NOT_FOUND, "Staff account not found");

  if (email && email !== account.email) {
    const existingUser = await User.findOne({ email, _id: { $ne: account._id } });
    if (existingUser) return responder(res, HTTP_STATUS.CONFLICT, "That email address is already in use");
    account.email = email;
  }
  if (name !== undefined) account.name = name;
  if (position !== undefined) account.position = position;
  if (avatar !== undefined) account.avatar = avatar;
  if (isBlocked !== undefined) account.isBlocked = isBlocked;
  await account.save();

  const publicAccount = { ...account.toObject(), password: undefined, createdBy: undefined };
  return res.status(HTTP_STATUS.OK).json({ message: "Staff account updated", user: publicAccount });
});

export const getPublicStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await StaffProfile.find({ active: true }).sort({ category: 1, displayOrder: 1, name: 1 });
  return res.status(HTTP_STATUS.OK).json(profiles);
});

export const getAllStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await StaffProfile.find().sort({ category: 1, displayOrder: 1, name: 1 });
  return res.status(HTTP_STATUS.OK).json(profiles);
});

export const reorderStaffProfiles = catchAsync(async (req: Request, res: Response) => {
  const { category, profileIds } = req.body as { category?: unknown; profileIds?: unknown };
  if (category !== "leadership" && category !== "staff") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership or staff");
  }
  if (!Array.isArray(profileIds) || profileIds.length > 200 ||
    profileIds.some((id) => typeof id !== "string" || !mongoose.isValidObjectId(id)) ||
    new Set(profileIds).size !== profileIds.length) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Provide a unique ordered list of valid profile IDs");
  }

  const currentProfiles = await StaffProfile.find({ category }).select("_id");
  if (currentProfiles.length !== profileIds.length ||
    !currentProfiles.every((profile) => profileIds.includes(profile._id.toString()))) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "The ordered profile list must include every profile in that section");
  }

  await StaffProfile.bulkWrite(profileIds.map((id, index) => ({
    updateOne: {
      filter: { _id: id, category },
      update: { $set: { displayOrder: index } },
    },
  })));
  const profiles = await StaffProfile.find({ category }).sort({ displayOrder: 1, name: 1 });
  return res.status(HTTP_STATUS.OK).json({ message: "Team profile order updated", data: profiles });
});

export const createPublicStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const { name, position, category, image } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof position !== "string" || !position.trim()) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a name and position");
  }
  if (category !== undefined && category !== "leadership" && category !== "staff") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership or staff");
  }

  const imageFile = (req.files as Record<string, Express.Multer.File[]> | undefined)?.image?.[0];
  const imageUrl = imageFile ? (await fileUploader([imageFile]))[0] : image;
  const profileCategory = category ?? "staff";
  const lastInCategory = await StaffProfile.findOne({ category: profileCategory }).sort({ displayOrder: -1 });
  const profile = await StaffProfile.create({
    name: name.trim(),
    position: position.trim(),
    category: profileCategory,
    displayOrder: (lastInCategory?.displayOrder ?? -1) + 1,
    image: imageUrl,
  });
  return res.status(HTTP_STATUS.CREATED).json({ message: "Team profile created", data: profile });
});

export const updatePublicStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const { name, position, category, image, active } = req.body;
  if (category !== undefined && category !== "leadership" && category !== "staff") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership or staff");
  }
  if (active !== undefined && typeof active !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Active status must be a boolean");
  }

  const profile = await StaffProfile.findById(req.params.id);
  if (!profile) return responder(res, HTTP_STATUS.NOT_FOUND, "Team profile not found");

  if (name !== undefined) profile.name = name;
  if (position !== undefined) profile.position = position;
  if (category !== undefined) profile.category = category;
  if (image !== undefined) profile.image = image;
  if (active !== undefined) profile.active = active;

  const imageFile = (req.files as Record<string, Express.Multer.File[]> | undefined)?.image?.[0];
  if (imageFile) profile.image = (await fileUploader([imageFile]))[0];
  await profile.save();
  return res.status(HTTP_STATUS.OK).json({ message: "Team profile updated", data: profile });
});

export const deletePublicStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const profile = await StaffProfile.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
  if (!profile) return responder(res, HTTP_STATUS.NOT_FOUND, "Team profile not found");
  return res.status(HTTP_STATUS.OK).json({ message: "Team profile deactivated", data: profile });
});

export const inviteStaff = catchAsync(async (req: Request, res: Response) => {
  const staff = await User.findOne({ _id: req.params.id, role: UserRole.STAFF });
  if (!staff) return responder(res, HTTP_STATUS.NOT_FOUND, "Staff profile not found");
  if (staff.isBlocked) return responder(res, HTTP_STATUS.BAD_REQUEST, "This staff profile is blocked");
  if (staff.isVerified) return responder(res, HTTP_STATUS.CONFLICT, "This staff account has already been activated");

  const magicToken = tokenGenerator({ userId: staff._id }, process.env.MAGIC_SECRET!, process.env.MAGIC_EXPIRATION!);
  const magicLink = `${process.env.FRONTEND_URL}/auth/magic?token=${magicToken}`;
  await magicMailer(staff.email, magicLink);

  return res.status(HTTP_STATUS.OK).json({ message: "Staff account setup link sent" });
});