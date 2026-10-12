import { Router } from "express";
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { upload } from "../utils/helper";
import { createProject, deleteProject, getAllProjects, getOneProject, getProjects, updateOneProject } from "../controllers/project.controller";

const router = Router();

router.post("/", authMiddleware, upload.single("image"), createProject);
router.get("/", getProjects);
router.get("/all", authMiddleware, getAllProjects);
router.route("/:id")
  .get(getOneProject)
  .patch(authMiddleware, authorizeRoles(UserRole.ADMIN), upload.single("image"), updateOneProject)
  .delete(authMiddleware, authorizeRoles(UserRole.ADMIN), deleteProject);

export default router;