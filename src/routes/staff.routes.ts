import { Router } from "express";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { upload } from "../utils/helper";
import {
  createPublicStaffProfile,
  createStaffProfile,
  deletePublicStaffProfile,
  getAllStaffProfiles,
  getPublicStaffProfiles,
  getPublicStaffProfileById,
  getStaffAccounts,
  getStaffProfiles,
  inviteStaff,
  reorderStaffProfiles,
  updatePublicStaffProfile,
  updateStaffAccount,
} from "../controllers/staff.controller";

const router = Router();

router.get("/", getStaffProfiles);
router.post("/", authMiddleware, authorizeRoles(UserRole.ADMIN), createStaffProfile);
router.post("/:id/invite", authMiddleware, authorizeRoles(UserRole.ADMIN), inviteStaff);
router.get("/accounts/all", authMiddleware, authorizeRoles(UserRole.ADMIN), getStaffAccounts);
router.patch("/accounts/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), updateStaffAccount);
router.get("/profiles/all", authMiddleware, authorizeRoles(UserRole.ADMIN), getAllStaffProfiles);
router.post("/profiles/reorder", authMiddleware, authorizeRoles(UserRole.ADMIN), reorderStaffProfiles);
router.get("/profiles/:id", getPublicStaffProfileById);
router.get("/profiles", getPublicStaffProfiles);
router.post("/profiles", authMiddleware, authorizeRoles(UserRole.ADMIN), upload.fields([{ name: "image", maxCount: 1 }]), createPublicStaffProfile);
router.patch("/profiles/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), upload.fields([{ name: "image", maxCount: 1 }]), updatePublicStaffProfile);
router.delete("/profiles/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), deletePublicStaffProfile);

export default router;