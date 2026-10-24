import { Request, Response } from "express";
import ContentItem, { CONTENT_KINDS, ContentItemType, ContentKind } from "../models/contentItem";
import { UserRole } from "../utils/types";
import { catchAsync } from "../utils/catchAsync";
import { fileUploader, responder } from "../utils/helper";
import { notifyAdmins, notifyUser } from "../utils/notifications";
import HTTP_STATUS from "../utils/statusCode";
import mongoose from "mongoose";
import User from "../models/user";
import { sanitizeRichContent } from "../utils/sanitizeContent";
import StaffProfile from "../models/staffProfile";

const slugify = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100)
  .replace(/-+$/g, "");

const slugKinds = (kind: ContentKind): ContentKind[] =>
  kind === "publication" || kind === "report" ? ["publication", "report"] : [kind];

const slugScopeFor = (kind: ContentKind): string | undefined =>
  kind === "publication" || kind === "report" ? "publications" : undefined;

const uniqueContentSlug = async (title: string, kind: ContentKind, excludeId?: mongoose.Types.ObjectId): Promise<string> => {
  const baseSlug = slugify(title) || kind;
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const existing = await ContentItem.exists({
      kind: { $in: slugKinds(kind) },
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique content URL");
};

const legacyNewsSlug = (title: string, id: string): string =>
  `${slugify(title) || "news"}-${id.slice(-6)}`;

const isDuplicateKeyError = (error: unknown): error is { code: number } =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

const hasSlug = (kind: ContentKind): boolean =>
  kind === "news" || kind === "blog" || kind === "publication" || kind === "report";

const hasDuplicateTitle = async (title: string, kind: ContentKind, excludeId?: mongoose.Types.ObjectId): Promise<boolean> => {
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  const escapedTitle = normalizedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(await ContentItem.exists({
    kind: { $in: slugKinds(kind) },
    title: { $regex: `^${escapedTitle}$`, $options: "i" },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    isDeleted: { $ne: true },
  }));
};

const contentPath = (kind: ContentKind): string => {
  const paths: Record<ContentKind, string> = {
    program: "programs",
    project: "projects",
    news: "news",
    opportunity: "opportunities",
    report: "reports",
    publication: "publications",
    blog: "blog",
    partner: "partners",
    innovation: "innovations",
  };
  return `/dashboard/${paths[kind]}`;
};

const getKind = (req: Request): ContentKind | null => {
  const kind = req.params.kind;
  return CONTENT_KINDS.includes(kind as ContentKind) ? kind as ContentKind : null;
};

const uploadedFile = (req: Request, field: "image" | "document"): Express.Multer.File | undefined => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  return files?.[field]?.[0];
};

const isAdmin = (req: Request): boolean => req.user?.role === UserRole.ADMIN;

const findPublisher = async (publisherId: unknown) => {
  if (typeof publisherId !== "string" || !mongoose.isValidObjectId(publisherId)) return null;
  return User.findOne({
    _id: publisherId,
    isBlocked: false,
    role: { $in: [UserRole.ADMIN, UserRole.STAFF] },
  }).select("name position avatar");
};

type PublisherWithAvatar = {
  _id?: mongoose.Types.ObjectId | string;
  avatar?: string;
};

const resolvePublisherAvatars = async <T extends { publisherUser?: PublisherWithAvatar | null }>(
  items: T[],
): Promise<T[]> => {
  const publisherIds = items
    .map((item) => item.publisherUser?._id?.toString())
    .filter((id): id is string => Boolean(id));
  if (publisherIds.length === 0) return items;

  const profiles = await StaffProfile.find({ accountId: { $in: publisherIds } }).select("accountId image");
  const imagesByAccountId = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.accountId && profile.image) {
      imagesByAccountId.set(profile.accountId.toString(), profile.image);
    }
  }

  return items.map((item) => {
    const publisher = item.publisherUser;
    const publisherId = publisher?._id?.toString();
    if (!publisher || publisher.avatar || !publisherId) return item;
    const avatar = imagesByAccountId.get(publisherId);
    return avatar ? { ...item, publisherUser: { ...publisher, avatar } } : item;
  });
};

export const getPublicContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");

  const items = await ContentItem.find({
    kind,
    approved: true,
    isDeleted: { $ne: true },
  })
    .populate("postedBy", "name position avatar")
    .populate("publisherUser", "name position avatar")
    .sort({ sortOrder: 1, date: -1, createdAt: -1 });
  const withPublisherFallback = items.map((item) => {
    const content = item.toObject();
    const { postedBy, ...publicContent } = content;
    return { ...publicContent, publisherUser: content.publisherUser || postedBy };
  });
  const publicItems = kind === "news" || kind === "blog"
    ? withPublisherFallback.map((item) => ({
      ...item,
      slug: item.slug || (kind === "news" ? legacyNewsSlug(item.title, item._id.toString()) : undefined),
    }))
    : withPublisherFallback;
  return res.status(HTTP_STATUS.OK).json(await resolvePublisherAvatars(publicItems));
});

export const getPublicContentBySlug = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  let item = await ContentItem.findOne({
    kind,
    slug: req.params.slug,
    approved: true,
    isDeleted: { $ne: true },
  });
  if (!item && kind === "news") {
    const publishedNews = await ContentItem.find({
      kind,
      approved: true,
      isDeleted: { $ne: true },
      slug: { $exists: false },
    });
    item = publishedNews.find((candidate) =>
      legacyNewsSlug(candidate.title, candidate._id.toString()) === req.params.slug,
    ) ?? null;
  }
  if (!item && kind !== "blog" && mongoose.isValidObjectId(req.params.slug)) {
    item = await ContentItem.findOne({
      _id: req.params.slug,
      kind,
      approved: true,
      isDeleted: { $ne: true },
    });
  }
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");
  await item.populate([
    { path: "postedBy", select: "name position avatar" },
    { path: "publisherUser", select: "name position avatar" },
  ]);
  const response = item.toObject();
  const { postedBy, ...publicResponse } = response;
  publicResponse.publisherUser = response.publisherUser || postedBy;
  if (kind === "news" && !response.slug) {
    publicResponse.slug = legacyNewsSlug(item.title, item._id.toString());
  }
  const [resolvedResponse] = await resolvePublisherAvatars([publicResponse]);
  return res.status(HTTP_STATUS.OK).json(resolvedResponse);
});

export const getAdminContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");

  const userId = req.user?._id;
  if (!isAdmin(req) && !userId) {
    return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to view content");
  }
  const query = ContentItem.find({
    kind,
    isDeleted: { $ne: true },
    ...(!isAdmin(req) && userId ? { postedBy: userId } : {}),
  })
    .populate("postedBy", "name email position avatar")
    .populate("publisherUser", "name position avatar")
    .sort({ createdAt: -1 });
  const items = await query;
  const adminItems = kind === "news" || kind === "blog"
    ? items.map((item) => ({
      ...item.toObject(),
      slug: item.slug || (kind === "news" ? legacyNewsSlug(item.title, item._id.toString()) : undefined),
    }))
    : items;
  const resolvedItems = adminItems.map((item) => {
    if (item.publisherUser) return item;
    return { ...item, publisherUser: item.postedBy };
  });
  return res.status(HTTP_STATUS.OK).json(resolvedItems);
});

export const createContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  if (!req.user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");
  if (typeof req.body.title !== "string" || !req.body.title.trim()) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter a title");
  }
  if (req.body.title.length > 200) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Title must be 200 characters or fewer");
  }
  if (hasSlug(kind) && await hasDuplicateTitle(req.body.title, kind)) {
    return responder(res, HTTP_STATUS.CONFLICT, "Content with this title already exists");
  }
  if (req.body.description !== undefined &&
    (typeof req.body.description !== "string" || req.body.description.length > 100_000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Description must be text no longer than 100,000 characters");
  }
  const boundedFields: Record<string, number> = {
    category: 80,
    theme: 80,
    language: 40,
    series: 160,
    summary: 300,
    location: 120,
    publisher: 200,
    imageCaption: 240,
  };
  for (const [field, maxLength] of Object.entries(boundedFields)) {
    if (req.body[field] !== undefined &&
      (typeof req.body[field] !== "string" || req.body[field].length > maxLength)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be text no longer than ${maxLength} characters`);
    }
  }
  if (hasSlug(kind) && req.body.imageWidth !== undefined) {
    const width = Number(req.body.imageWidth);
    if (!Number.isInteger(width) || width < 25 || width > 100) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image width must be between 25 and 100");
    }
  }
  if (hasSlug(kind) && req.body.imageAlignment !== undefined &&
    !["left", "center", "right"].includes(req.body.imageAlignment)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image alignment must be left, center, or right");
  }
  if (req.body.approved !== undefined && ![true, false, "true", "false"].includes(req.body.approved)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Publication status must be true or false");
  }
  if (req.body.featured !== undefined && ![true, false, "true", "false"].includes(req.body.featured)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Featured status must be true or false");
  }
  if (req.body.posterId !== undefined) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Poster is determined by the authenticated uploader and cannot be changed");
  }
  const imageFile = uploadedFile(req, "image");
  const documentFile = uploadedFile(req, "document");
  if (req.body.publisherId !== undefined && !isAdmin(req)) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can choose another publisher");
  }
  const selectedPublisher = req.body.publisherId === undefined
    ? req.user
    : await findPublisher(req.body.publisherId);
  if (!selectedPublisher) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected publisher must be an active staff or administrator account");
  }
  const contentDate = req.body.date ? new Date(req.body.date) : undefined;
  if (contentDate && Number.isNaN(contentDate.getTime())) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid date");
  }
  const [imageUrls, documentUrls] = await Promise.all([
    imageFile ? fileUploader([imageFile]) : Promise.resolve([]),
    documentFile ? fileUploader([documentFile], "raw") : Promise.resolve([]),
  ]);

  const values: Partial<ContentItemType> = {
    kind,
    title: req.body.title.trim(),
    ...(hasSlug(kind) ? {
      slug: await uniqueContentSlug(req.body.title.trim(), kind),
      ...(slugScopeFor(kind) ? { slugScope: slugScopeFor(kind) } : {}),
    } : {}),
    description: typeof req.body.description === "string"
      ? kind === "news" || kind === "blog" ? sanitizeRichContent(req.body.description) : req.body.description
      : undefined,
    context: req.body.context,
    summary: req.body.summary,
    category: req.body.category,
    theme: req.body.theme,
    language: req.body.language,
    series: req.body.series,
    status: req.body.status,
    image: imageUrls[0] ?? req.body.image,
    imageCaption: req.body.imageCaption,
    imageWidth: req.body.imageWidth === undefined ? undefined : Number(req.body.imageWidth),
    imageAlignment: req.body.imageAlignment,
    link: req.body.link,
    location: req.body.location,
    type: req.body.type,
    deadline: req.body.deadline,
    publisher: selectedPublisher.name,
    publisherUser: selectedPublisher._id,
    date: contentDate,
    document: documentUrls[0] ?? req.body.document,
    approved: req.body.approved === undefined
      ? true
      : req.body.approved === "true" || req.body.approved === true,
    featured: req.user.role === UserRole.STAFF || req.body.featured === true || req.body.featured === "true",
    postedBy: req.user._id,
  };

  let item: mongoose.HydratedDocument<ContentItemType>;
  for (let attempt = 0; ; attempt += 1) {
    try {
      item = await ContentItem.create(values);
      break;
    } catch (error) {
      if (!hasSlug(kind) || !isDuplicateKeyError(error) || attempt >= 4) throw error;
      if (await hasDuplicateTitle(req.body.title, kind)) {
        return responder(res, HTTP_STATUS.CONFLICT, "Content with this title already exists");
      }
      values.slug = await uniqueContentSlug(req.body.title.trim(), kind);
    }
  }
  if (!item.approved && !isAdmin(req)) {
    await notifyAdmins({
      category: "content",
      title: `Content awaiting approval: ${item.title}`,
      message: `A ${kind} entry was submitted for review.`,
      href: contentPath(kind),
      read: false,
    });
  }

  return res.status(HTTP_STATUS.CREATED).json({ message: "Content created", data: item });
});

export const updateContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  const item = await ContentItem.findOne({ _id: req.params.id, kind, isDeleted: { $ne: true } });
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");
  if (!isAdmin(req) && item.postedBy?.toString() !== req.user?._id?.toString()) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "You can only edit your own posts");
  }
  if (req.body.posterId !== undefined) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Poster is determined by the authenticated uploader and cannot be changed");
  }

  const fields: (keyof ContentItemType)[] = [
    "title", "description", "context", "summary", "category", "status", "image",
    "imageCaption", "link", "location", "type", "deadline", "document", "theme", "language", "series",
  ];
  if (req.body.title !== undefined &&
    (typeof req.body.title !== "string" || !req.body.title.trim() || req.body.title.length > 200)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Title must be between 1 and 200 characters");
  }
  if (hasSlug(kind) && req.body.title !== undefined && await hasDuplicateTitle(req.body.title, kind, item._id)) {
    return responder(res, HTTP_STATUS.CONFLICT, "Content with this title already exists");
  }
  if (req.body.description !== undefined &&
    (typeof req.body.description !== "string" || req.body.description.length > 100_000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Description must be text no longer than 100,000 characters");
  }
  const boundedFields: Record<string, number> = {
    category: 80,
    theme: 80,
    language: 40,
    series: 160,
    summary: 300,
    location: 120,
    publisher: 200,
    imageCaption: 240,
  };
  for (const [field, maxLength] of Object.entries(boundedFields)) {
    if (req.body[field] !== undefined &&
      (typeof req.body[field] !== "string" || req.body[field].length > maxLength)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be text no longer than ${maxLength} characters`);
    }
  }
  if (req.body.publisherId !== undefined && !isAdmin(req)) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can choose another publisher");
  }
  if (req.body.posterId !== undefined) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Poster is determined by the authenticated uploader and cannot be changed");
  }
  if (isAdmin(req) && req.body.publisherId !== undefined) {
    const selectedPublisher = await findPublisher(req.body.publisherId);
    if (!selectedPublisher) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected publisher must be an active staff or administrator account");
    }
    item.publisherUser = selectedPublisher._id;
    item.publisher = selectedPublisher.name;
  }
  if (req.body.approved !== undefined && ![true, false, "true", "false"].includes(req.body.approved)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Publication status must be true or false");
  }
  if (req.body.featured !== undefined && ![true, false, "true", "false"].includes(req.body.featured)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Featured status must be true or false");
  }
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      if (field === "description" && (kind === "news" || kind === "blog")) {
        item.description = sanitizeRichContent(req.body.description);
      } else if (typeof req.body[field] === "string") {
        (item[field] as string | undefined) = req.body[field];
      } else {
        return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be text`);
      }
    }
  }
  if (hasSlug(kind) && req.body.imageWidth !== undefined) {
    const width = Number(req.body.imageWidth);
    if (!Number.isInteger(width) || width < 25 || width > 100) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image width must be between 25 and 100");
    }
    item.imageWidth = width;
  }
  if (hasSlug(kind) && req.body.imageAlignment !== undefined) {
    if (!["left", "center", "right"].includes(req.body.imageAlignment)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image alignment must be left, center, or right");
    }
    item.imageAlignment = req.body.imageAlignment;
  }
  if ((kind === "news" || kind === "blog") && req.body.title !== undefined) {
    item.slug = await uniqueContentSlug(req.body.title.trim(), kind, item._id);
  } else if (hasSlug(kind) && !item.slug) {
    item.slug = await uniqueContentSlug(item.title, kind, item._id);
  }
  if (slugScopeFor(kind)) item.slugScope = slugScopeFor(kind);
  if (req.body.date !== undefined) {
    const parsedDate = req.body.date ? new Date(req.body.date) : undefined;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid date");
    }
    item.date = parsedDate;
  }
  if ((isAdmin(req) || item.postedBy?.toString() === req.user?._id?.toString()) && req.body.approved !== undefined) {
    item.approved = req.body.approved === true || req.body.approved === "true";
  }
  if (isAdmin(req) && req.body.featured !== undefined) {
    item.featured = req.body.featured === true || req.body.featured === "true";
  }

  const imageFile = uploadedFile(req, "image");
  const documentFile = uploadedFile(req, "document");
  if (imageFile) item.image = (await fileUploader([imageFile]))[0];
  if (documentFile) item.document = (await fileUploader([documentFile], "raw"))[0];

  try {
    await item.save();
  } catch (error) {
    if (isDuplicateKeyError(error) && hasSlug(kind)) {
      return responder(res, HTTP_STATUS.CONFLICT, "A publication with this title or URL already exists");
    }
    throw error;
  }
  return res.status(HTTP_STATUS.OK).json({ message: "Content updated", data: item });
});

export const setContentApproval = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  if (typeof req.body.approved !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Approval status must be true or false");
  }

  const item = await ContentItem.findOne({ _id: req.params.id, kind, isDeleted: { $ne: true } });
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");
  if (!isAdmin(req) && item.postedBy?.toString() !== req.user?._id?.toString()) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "You can only update publication status for your own posts");
  }
  item.approved = req.body.approved;
  await item.save();

  if (item.postedBy) {
    await notifyUser(item.postedBy.toString(), {
      category: "approval",
      title: `Content ${req.body.approved ? "approved" : "returned"}: ${item.title}`,
      message: req.body.approved
        ? "Your submission has been published."
        : "Your submission is no longer published. Contact an administrator for details.",
      href: contentPath(kind),
      read: false,
    });
  }

  return res.status(HTTP_STATUS.OK).json({ message: "Approval status updated", data: item });
});

export const deleteContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can delete content");

  const item = await ContentItem.findOneAndUpdate(
    { _id: req.params.id, kind, isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true },
  );
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");

  return res.status(HTTP_STATUS.OK).json({ message: "Content deleted", data: item });
});

export const uploadNewsImage = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind || !hasSlug(kind)) {
    return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  }
  if (!req.file) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please select an image");
  const imageUrls = await fileUploader([req.file]);
  return res.status(HTTP_STATUS.CREATED).json({ data: { url: imageUrls[0] } });
});
