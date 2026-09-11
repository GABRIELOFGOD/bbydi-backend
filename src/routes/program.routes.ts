import { Router } from "express"
import { authMiddleware } from "../middlewares/verifiedUser.middleware";
import { authorizeRoles } from "../middlewares/authorization.middleware";
import { UserRole } from "../utils/types";
import { upload } from "../utils/helper";
import { createProgram, deleteProgram, getAllPrograms, getOneProgram, getPrograms, updateOneProgram } from "../controllers/program.controller";

const router = Router();

router.post("/", authMiddleware, upload.single("image"), createProgram);
router.get("/", getPrograms);
router.get("/all", authMiddleware, getAllPrograms);
router.route("/:id")
  .get(getOneProgram)
  .patch(authMiddleware, authorizeRoles(UserRole.ADMIN), updateOneProgram)
  .delete(authMiddleware, authorizeRoles(UserRole.ADMIN), deleteProgram)

export default router;