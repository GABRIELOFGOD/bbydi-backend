import { Request, Response } from "express";
import ContentItem, { CONTENT_KINDS, ContentItemType, ContentKind } from "../models/contentItem";
import { UserRole } from "../utils/types";
import { catchAsync } from "../utils/catchAsync";
import { fileUploader, responder } from "../utils/helper";
import { notifyAdmins, notifyUser } from "../utils/notifications";
import HTTP_STATUS from "../utils/statusCode";

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
  return res.status(HTTP_STATUS.OK).json(items);
});

export const getAdminContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");

  const query = ContentItem.find({ kind, isDeleted: { $ne: true } })
    .populate("postedBy", "name email")
    .sort({ createdAt: -1 });
  return res.status(HTTP_STATUS.OK).json(await query);
});

export const createContent = catchAsync(async (req: Request, res: Response) => {
  const kind = getKind(req);
  if (!kind) return responder(res, HTTP_STATUS.NOT_FOUND, "Content type not found");
  if (!req.user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");
  if (typeof req.body.title !== "string" || !req.body.title.trim()) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter a title");
  }

  const imageFile = uploadedFile(req, "image");
  const documentFile = uploadedFile(req, "document");
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
    description: req.body.description,
    context: req.body.context,
    summary: req.body.summary,
    category: req.body.category,
    status: req.body.status,
    image: imageUrls[0] ?? req.body.image,
    link: req.body.link,
    location: req.body.location,
    type: req.body.type,
    deadline: req.body.deadline,
    publisher: req.body.publisher,
    date: contentDate,
    document: documentUrls[0] ?? req.body.document,
    approved: isAdmin(req) && (req.body.approved === undefined || req.body.approved === "true" || req.body.approved === true),
    postedBy: req.user,
  };

  const item = await ContentItem.create(values);
  if (!item.approved) {
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
    "link", "location", "type", "deadline", "publisher", "document",
  ];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      (item[field] as string | undefined) = req.body[field];
    }
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
