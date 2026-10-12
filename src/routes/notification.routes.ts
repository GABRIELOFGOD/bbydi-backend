import { Router } from "express";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { getNotifications, markNotificationRead } from "../controllers/notification.controller";

const router = Router();

router.get("/", authMiddleware, getNotifications);
router.patch("/:id/read", authMiddleware, markNotificationRead);

export default router;
