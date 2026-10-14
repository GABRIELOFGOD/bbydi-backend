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
import ContentItem from "../models/contentItem";

export const createStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const admin = req.user;
  if (!admin) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");

  const { email, name, position, avatar, bio } = req.body;
  if (!email || !isValidEmail(email)) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address");
  if (!name) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide staff name");

  const existingUser = await User.findOne({ email });
  if (existingUser) return responder(res, HTTP_STATUS.CONFLICT, "A staff profile with this email already exists");

  if (bio !== undefined && (typeof bio !== "string" || bio.length > 5000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Biography must be no longer than 5,000 characters");
  }
  const staff = await User.create({ email, name, position, avatar, bio, role: UserRole.STAFF, createdBy: admin });
  try {
    const magicToken = tokenGenerator({ userId: staff._id }, process.env.MAGIC_SECRET!, process.env.MAGIC_EXPIRATION!);
    const magicLink = `${process.env.FRONTEND_URL}/auth/magic?token=${magicToken}`;
    await magicMailer(staff.email, magicLink);
  } catch (error) {
    await User.findByIdAndDelete(staff._id);
    throw error;
  }
  return res.status(HTTP_STATUS.CREATED).json({ message: "Staff profile created", user: staff });
});

export const getStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const staff = await User.find({ role: UserRole.STAFF, isBlocked: false }).select("-password -createdBy -email");
  return res.status(HTTP_STATUS.OK).json({ message: "Staff profiles fetched", data: staff });
});

export const getStaffAccounts = catchAsync(async (_req: Request, res: Response) => {
  const accounts = await User.find({ role: UserRole.STAFF }).select("-password -createdBy").sort({ name: 1 });
  return res.status(HTTP_STATUS.OK).json({ data: accounts });
});

export const updateStaffAccount = catchAsync(async (req: Request, res: Response) => {
  const { name, email, position, avatar, bio, isBlocked } = req.body;
  if (email !== undefined && !isValidEmail(email)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address");
  }
  if (isBlocked !== undefined && typeof isBlocked !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Account status must be a boolean");
  }
  for (const [field, value, limit] of [
    ["name", name, 200],
    ["position", position, 200],
    ["avatar", avatar, 2000],
    ["bio", bio, 5000],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.length > limit || (field === "name" && !value.trim()))) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be valid text no longer than ${limit} characters`);
    }
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
  if (bio !== undefined) account.bio = bio;
  if (isBlocked !== undefined) account.isBlocked = isBlocked;
  await account.save();

  const publicAccount = { ...account.toObject(), password: undefined, createdBy: undefined };
  return res.status(HTTP_STATUS.OK).json({ message: "Staff account updated", user: publicAccount });
});

export const getPublicStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await StaffProfile.find({ active: true })
    .populate({ path: "accountId", match: { role: UserRole.STAFF, isBlocked: false }, select: "name position avatar bio" })
    .sort({ category: 1, displayOrder: 1, name: 1 });
  const publicProfiles = profiles.map((profile) => {
    const account = profile.populated("accountId")
      ? profile.accountId as unknown as {
        _id: mongoose.Types.ObjectId;
        name: string;
        position: string;
        avatar?: string;
        bio?: string;
      }
      : null;
    return {
      ...profile.toObject(),
      name: account?.name ?? profile.name,
      position: account?.position || profile.position,
      image: account?.avatar || profile.image,
      bio: account?.bio?.trim() || profile.bio || "",
      accountId: account ? String(account._id) : undefined,
    };
  });
  return res.status(HTTP_STATUS.OK).json(publicProfiles);
});

export const getPublicStaffProfileById = catchAsync(async (req: Request, res: Response) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return responder(res, HTTP_STATUS.NOT_FOUND, "Team profile not found");
  }
  const profile = await StaffProfile.findOne({ _id: req.params.id, active: true });
  if (!profile) return responder(res, HTTP_STATUS.NOT_FOUND, "Team profile not found");

  const account = profile.accountId
    ? await User.findOne({ _id: profile.accountId, role: UserRole.STAFF, isBlocked: false }).select("name position avatar bio")
    : null;
  const posts = account
    ? await ContentItem.find({
      postedBy: account._id,
      approved: true,
      isDeleted: { $ne: true },
    }).select("kind title summary description image slug date category createdAt featured")
      .sort({ date: -1, createdAt: -1 })
      .limit(50)
    : [];

  return res.status(HTTP_STATUS.OK).json({
    profile: {
      _id: profile._id,
      name: account?.name ?? profile.name,
      position: account?.position || profile.position,
      image: account?.avatar || profile.image,
      category: profile.category,
      bio: account?.bio?.trim() || profile.bio || "",
    },
    posts: posts.map((post) => ({
      ...post.toObject(),
      slug: post.kind === "news" ? post.slug || post._id.toString() : post.slug,
      featured: true,
    })),
  });
});

export const getAllStaffProfiles = catchAsync(async (_req: Request, res: Response) => {
  const profiles = await StaffProfile.find().sort({ category: 1, displayOrder: 1, name: 1 });
  return res.status(HTTP_STATUS.OK).json(profiles);
});

export const reorderStaffProfiles = catchAsync(async (req: Request, res: Response) => {
  const { category, profileIds } = req.body as { category?: unknown; profileIds?: unknown };
  if (category !== "leadership" && category !== "staff" && category !== "volunteer") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership, staff, or volunteer");
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
  const { name, position, category, image, bio, accountId } = req.body;
  if (typeof name !== "string" || !name.trim() || typeof position !== "string" || !position.trim()) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a name and position");
  }
  if (category !== undefined && category !== "leadership" && category !== "staff" && category !== "volunteer") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership, staff, or volunteer");
  }
  if (bio !== undefined && (typeof bio !== "string" || bio.length > 5000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Biography must be no longer than 5,000 characters");
  }
  let linkedAccountId: mongoose.Types.ObjectId | undefined;
  if (accountId) {
    if (typeof accountId !== "string" || !mongoose.isValidObjectId(accountId)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Choose a valid staff account");
    }
    const account = await User.findOne({ _id: accountId, role: UserRole.STAFF, isBlocked: false });
    if (!account) return responder(res, HTTP_STATUS.BAD_REQUEST, "Choose an active staff account");
    if (await StaffProfile.exists({ accountId })) {
      return responder(res, HTTP_STATUS.CONFLICT, "That staff account is already linked to a team profile");
    }
    linkedAccountId = account._id;
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
    bio,
    accountId: linkedAccountId,
  });
  return res.status(HTTP_STATUS.CREATED).json({ message: "Team profile created", data: profile });
});

export const updatePublicStaffProfile = catchAsync(async (req: Request, res: Response) => {
  const { name, position, category, image, active, bio, accountId } = req.body;
  if (category !== undefined && category !== "leadership" && category !== "staff" && category !== "volunteer") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Category must be leadership, staff, or volunteer");
  }
  if (active !== undefined && typeof active !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Active status must be a boolean");
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 200)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Name must be between 1 and 200 characters");
  }
  if (position !== undefined && (typeof position !== "string" || !position.trim() || position.length > 200)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Position must be between 1 and 200 characters");
  }
  if (bio !== undefined && (typeof bio !== "string" || bio.length > 5000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Biography must be no longer than 5,000 characters");
  }

  const profile = await StaffProfile.findById(req.params.id);
  if (!profile) return responder(res, HTTP_STATUS.NOT_FOUND, "Team profile not found");

  if (name !== undefined) profile.name = name;
  if (position !== undefined) profile.position = position;
  if (category !== undefined && category !== profile.category) {
    const lastInCategory = await StaffProfile.findOne({ category }).sort({ displayOrder: -1 });
    profile.displayOrder = (lastInCategory?.displayOrder ?? -1) + 1;
    profile.category = category;
  }
  if (image !== undefined) profile.image = image;
  if (active !== undefined) profile.active = active;
  if (bio !== undefined) profile.bio = bio;
  if (accountId !== undefined) {
    if (accountId === "") {
      profile.accountId = undefined;
    } else {
      if (typeof accountId !== "string" || !mongoose.isValidObjectId(accountId)) {
        return responder(res, HTTP_STATUS.BAD_REQUEST, "Choose a valid staff account");
      }
      const account = await User.findOne({ _id: accountId, role: UserRole.STAFF, isBlocked: false });
      if (!account) return responder(res, HTTP_STATUS.BAD_REQUEST, "Choose an active staff account");
      const linkedProfile = await StaffProfile.findOne({ accountId, _id: { $ne: profile._id } });
      if (linkedProfile) return responder(res, HTTP_STATUS.CONFLICT, "That staff account is already linked to another team profile");
      profile.accountId = account._id;
    }
  }

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