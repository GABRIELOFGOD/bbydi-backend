import { Router } from "express";
import { login, magicLinkAuth, register } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { userProfile } from "../controllers/user.controller";

const router = Router();

router.get("/me", authMiddleware, userProfile);
router.post("/login", login);
router.post("/magic/:token", magicLinkAuth);
router.post("/register", authMiddleware, authorizeRoles(UserRole.ADMIN), register);

export default router;