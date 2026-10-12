import { Router } from "express";
import {
  changeCurrentPassword,
  forgotPassword,
  login,
  magicLinkAuth,
  register,
  updateCurrentUser,
} from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { userProfile } from "../controllers/user.controller";

const router = Router();

router.get("/me", authMiddleware, userProfile);
router.patch("/me", authMiddleware, updateCurrentUser);
router.patch("/me/password", authMiddleware, changeCurrentPassword);
router.post("/login", login);
router.post("/magic/:token", magicLinkAuth);
router.post("/reset-password/:token", magicLinkAuth);
router.post("/forgot-password", forgotPassword);
router.post("/register", authMiddleware, authorizeRoles(UserRole.ADMIN), register);

export default router;