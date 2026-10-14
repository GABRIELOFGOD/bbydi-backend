import { Request, Response, Router } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { contentUpload } from "../utils/helper";
import ContentItem, { CONTENT_KINDS, ContentKind } from "../models/contentItem";
import HTTP_STATUS from "../utils/statusCode";
import {
  createContent,
  deleteContent,
  getAdminContent,
  getPublicContent,
  getPublicContentBySlug,
  setContentApproval,
  updateContent,
  uploadNewsImage,
} from "../controllers/content.controller";

const router = Router();
const contentFiles = contentUpload.fields([
  { name: "image", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

const authorizeContentOwner = async (req: Request, res: Response, next: (error?: unknown) => void) => {
  if (req.user?.role === UserRole.ADMIN) return next();
  const kind = req.params.kind;
  const id = req.params.id;
  if (typeof kind !== "string" || !CONTENT_KINDS.includes(kind as ContentKind) ||
    typeof id !== "string" || !mongoose.isValidObjectId(id)) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ message: "Content not found" });
  }
  const item = await ContentItem.findOne({
    _id: id,
    kind: kind as ContentKind,
    isDeleted: { $ne: true },
  }).select("postedBy");
  if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ message: "Content not found" });
  if (item.postedBy?.toString() !== req.user?._id?.toString()) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({ message: "You can only edit your own posts" });
  }
  return next();
};

router.get("/:kind/all", authMiddleware, getAdminContent);
router.get("/:kind/:slug", getPublicContentBySlug);
router.get("/:kind", getPublicContent);
router.post("/:kind/images", authMiddleware, authorizeRoles(UserRole.ADMIN, UserRole.STAFF), contentUpload.single("image"), uploadNewsImage);
router.post("/:kind", authMiddleware, authorizeRoles(UserRole.ADMIN, UserRole.STAFF), contentFiles, createContent);
router.patch("/:kind/:id/approval", authMiddleware, authorizeRoles(UserRole.ADMIN, UserRole.STAFF), setContentApproval);
router.patch("/:kind/:id", authMiddleware, authorizeRoles(UserRole.ADMIN, UserRole.STAFF), authorizeContentOwner, contentFiles, updateContent);
router.delete("/:kind/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), deleteContent);

export default router;
