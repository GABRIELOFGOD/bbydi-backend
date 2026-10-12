import { Router } from "express";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import {
  deleteContactSubmission,
  getContactSubmissions,
  submitContact,
  updateContactStatus,
} from "../controllers/contact.controller";

const router = Router();

router.post("/", submitContact);
router.get("/", authMiddleware, authorizeRoles(UserRole.ADMIN), getContactSubmissions);
router.patch("/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), updateContactStatus);
router.delete("/:id", authMiddleware, authorizeRoles(UserRole.ADMIN), deleteContactSubmission);

export default router;

