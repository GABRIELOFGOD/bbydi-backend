import { Request, Response } from "express";
import ContentItem, { CONTENT_KINDS, ContentItemType, ContentKind } from "../models/contentItem";
import { UserRole } from "../utils/types";
import { catchAsync } from "../utils/catchAsync";
import { fileUploader, responder } from "../utils/helper";
import { notifyAdmins, notifyUser } from "../utils/notifications";
import HTTP_STATUS from "../utils/statusCode";
import sanitizeHtml from "sanitize-html";
import mongoose from "mongoose";
import User from "../models/user";

const sanitizeNewsContent = (content: string): string => sanitizeHtml(content, {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "h1", "h2", "h3", "img", "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "data-width", "data-align"],
    div: ["data-image-gallery", "data-columns"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["https"] },
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }, true),
  },
});

const slugify = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 100)
  .replace(/-+$/g, "");

const uniqueNewsSlug = async (title: string, excludeId?: mongoose.Types.ObjectId): Promise<string> => {
  const baseSlug = slugify(title) || "news";
  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const candidate = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
    const existing = await ContentItem.exists({
      kind: "news",
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique article URL");
};

const legacyNewsSlug = (title: string, id: string): string =>
  `${slugify(title) || "news"}-${id.slice(-6)}`;

const isDuplicateKeyError = (error: unknown): error is { code: number } =>
  typeof error === "object" && error !== null && "code" in error && error.code === 11000;

const contentPath = (kind: ContentKind): string => {
  const paths: Record<ContentKind, string> = {
    program: "programs",
    project: "projects",
    news: "news",
    opportunity: "opportunities",
    report: "reports",
    publication: "publications",
    partner: "partners",
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

export const getPublicContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");

  const items = await ContentItem.find({
    kind,
    approved: true,
    isDeleted: { $ne: true },
  }).sort({ sortOrder: 1, date: -1, createdAt: -1 });
  const publicItems = kind === "news"
    ? items.map((item) => ({
      ...item.toObject(),
      slug: item.slug || legacyNewsSlug(item.title, item._id.toString()),
    }))
    : items;
  return res.status(HTTP_STATUS.OK).json(publicItems);
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
  if (!item && mongoose.isValidObjectId(req.params.slug)) {
    item = await ContentItem.findOne({
      _id: req.params.slug,
      kind,
      approved: true,
      isDeleted: { $ne: true },
    });
  }
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");
  const response = item.toObject();
  if (kind === "news" && !response.slug) {
    response.slug = legacyNewsSlug(item.title, item._id.toString());
  }
  return res.status(HTTP_STATUS.OK).json(response);
});

export const getAdminContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");

  if (kind === "news" && !isAdmin(req)) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can manage news");
  }

  const userId = req.user?._id;
  if (!isAdmin(req) && !userId) {
    return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to view content");
  }
  const query = ContentItem.find({
    kind,
    isDeleted: { $ne: true },
    ...(!isAdmin(req) && userId ? { postedBy: userId } : {}),
  })
    .populate("postedBy", "name email")
    .sort({ createdAt: -1 });
  const items = await query;
  const adminItems = kind === "news"
    ? items.map((item) => ({
      ...item.toObject(),
      slug: item.slug || legacyNewsSlug(item.title, item._id.toString()),
    }))
    : items;
  return res.status(HTTP_STATUS.OK).json(adminItems);
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
  if (req.body.description !== undefined &&
    (typeof req.body.description !== "string" || req.body.description.length > 100_000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Description must be text no longer than 100,000 characters");
  }
  const boundedFields: Record<string, number> = {
    category: 80,
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
  if (kind === "news" && req.body.imageWidth !== undefined) {
    const width = Number(req.body.imageWidth);
    if (!Number.isInteger(width) || width < 25 || width > 100) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image width must be between 25 and 100");
    }
  }
  if (kind === "news" && req.body.imageAlignment !== undefined &&
    !["left", "center", "right"].includes(req.body.imageAlignment)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image alignment must be left, center, or right");
  }
  if (kind === "news" && !isAdmin(req)) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can publish news");
  }

  const imageFile = uploadedFile(req, "image");
  const documentFile = uploadedFile(req, "document");
  let poster = req.user;
  if (req.body.posterId !== undefined && req.body.posterId !== req.user._id?.toString()) {
    if (typeof req.body.posterId !== "string" || !mongoose.isValidObjectId(req.body.posterId)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Please select a valid staff publisher");
    }
    const selectedPoster = await User.findOne({
      _id: req.body.posterId,
      role: UserRole.STAFF,
      isBlocked: false,
    });
    if (!selectedPoster) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected publisher must be an active staff account");
    }
    poster = selectedPoster.toObject();
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
    ...(kind === "news" ? { slug: await uniqueNewsSlug(req.body.title.trim()) } : {}),
    description: typeof req.body.description === "string"
      ? kind === "news" ? sanitizeNewsContent(req.body.description) : req.body.description
      : undefined,
    context: req.body.context,
    summary: req.body.summary,
    category: req.body.category,
    status: req.body.status,
    image: imageUrls[0] ?? req.body.image,
    imageCaption: req.body.imageCaption,
    imageWidth: req.body.imageWidth === undefined ? undefined : Number(req.body.imageWidth),
    imageAlignment: req.body.imageAlignment,
    link: req.body.link,
    location: req.body.location,
    type: req.body.type,
    deadline: req.body.deadline,
    publisher: poster.name,
    date: contentDate,
    document: documentUrls[0] ?? req.body.document,
    approved: isAdmin(req) && (req.body.approved === undefined || req.body.approved === "true" || req.body.approved === true),
    postedBy: poster._id,
  };

  let item: mongoose.HydratedDocument<ContentItemType>;
  for (let attempt = 0; ; attempt += 1) {
    try {
      item = await ContentItem.create(values);
      break;
    } catch (error) {
      if (kind !== "news" || !isDuplicateKeyError(error) || attempt >= 4) throw error;
      values.slug = await uniqueNewsSlug(req.body.title.trim());
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
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can edit content");

  const item = await ContentItem.findOne({ _id: req.params.id, kind, isDeleted: { $ne: true } });
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");

  const fields: (keyof ContentItemType)[] = [
    "title", "description", "context", "summary", "category", "status", "image",
    "imageCaption", "link", "location", "type", "deadline", "document",
  ];
  if (req.body.title !== undefined &&
    (typeof req.body.title !== "string" || !req.body.title.trim() || req.body.title.length > 200)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Title must be between 1 and 200 characters");
  }
  if (req.body.description !== undefined &&
    (typeof req.body.description !== "string" || req.body.description.length > 100_000)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Description must be text no longer than 100,000 characters");
  }
  const boundedFields: Record<string, number> = {
    category: 80,
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
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      if (field === "description" && kind === "news") {
        item.description = sanitizeNewsContent(req.body.description);
      } else if (typeof req.body[field] === "string") {
        (item[field] as string | undefined) = req.body[field];
      } else {
        return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be text`);
      }
    }
    if (kind === "news" && req.body.imageWidth !== undefined) {
      const width = Number(req.body.imageWidth);
      if (!Number.isInteger(width) || width < 25 || width > 100) {
        return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image width must be between 25 and 100");
      }
      item.imageWidth = width;
    }
    if (kind === "news" && req.body.imageAlignment !== undefined) {
      if (!["left", "center", "right"].includes(req.body.imageAlignment)) {
        return responder(res, HTTP_STATUS.BAD_REQUEST, "Lead image alignment must be left, center, or right");
      }
      item.imageAlignment = req.body.imageAlignment;
    }
  }
  if (kind === "news" && req.body.title !== undefined) {
    item.slug = await uniqueNewsSlug(req.body.title.trim(), item._id);
  } else if (kind === "news" && !item.slug) {
    item.slug = await uniqueNewsSlug(item.title, item._id);
  }
  if (kind === "news" && req.body.posterId !== undefined) {
    if (typeof req.body.posterId !== "string" || !mongoose.isValidObjectId(req.body.posterId)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Please select a valid staff publisher");
    }
    let selectedPoster;
    if (req.body.posterId === req.user?._id?.toString()) {
      selectedPoster = await User.findOne({ _id: req.body.posterId, role: UserRole.ADMIN });
    } else {
      selectedPoster = await User.findOne({
        _id: req.body.posterId,
        role: UserRole.STAFF,
        isBlocked: false,
      });
    }
    if (!selectedPoster) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected publisher must be the administrator or an active staff account");
    }
    item.postedBy = selectedPoster._id;
    item.publisher = selectedPoster.name;
  }

  if (req.body.date !== undefined) {
    const parsedDate = req.body.date ? new Date(req.body.date) : undefined;
    if (parsedDate && Number.isNaN(parsedDate.getTime())) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid date");
    }
    item.date = parsedDate;
  }
  if (req.body.approved !== undefined) {
    item.approved = req.body.approved === true || req.body.approved === "true";
  }

  const imageFile = uploadedFile(req, "image");
  const documentFile = uploadedFile(req, "document");
  if (imageFile) item.image = (await fileUploader([imageFile]))[0];
  if (documentFile) item.document = (await fileUploader([documentFile], "raw"))[0];

  await item.save();
  return res.status(HTTP_STATUS.OK).json({ message: "Content updated", data: item });
});

export const setContentApproval = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  if (!isAdmin(req)) return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can review content");
  if (typeof req.body.approved !== "boolean") {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Approval status must be true or false");
  }

  const item = await ContentItem.findOneAndUpdate(
    { _id: req.params.id, kind, isDeleted: { $ne: true } },
    { approved: req.body.approved },
    { new: true },
  );
  if (!item) return responder(res, HTTP_STATUS.NOT_FOUND, "Content not found");

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
  if (req.params.kind !== "news") {
    return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  }
  if (!req.file) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please select an image");
  const imageUrls = await fileUploader([req.file]);
  return res.status(HTTP_STATUS.CREATED).json({ data: { url: imageUrls[0] } });
});
