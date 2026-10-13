import { Router } from "express";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { contentUpload } from "../utils/helper";
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

router.get("/:kind/all", authMiddleware, getAdminContent);
router.get("/:kind/:slug", getPublicContentBySlug);
router.get("/:kind", getPublicContent);
router.post("/:kind/images", authMiddleware, authorizeRoles(UserRole.ADMIN), contentUpload.single("image"), uploadNewsImage);
router.post("/:kind", authMiddleware, contentFiles, createContent);
router.patch("/:kind/:id/approval", authMiddleware, authorizeRoles(UserRole.ADMIN), setContentApproval);
router.patch("/:kind/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), contentFiles, updateContent);
router.delete("/:kind/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), deleteContent);

export default router;
