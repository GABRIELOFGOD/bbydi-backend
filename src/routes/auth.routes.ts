import { Router } from "express";
import { login, magicLinkAuth, register } from "../controllers/auth.controller";

const router = Router();

router.post("/login", login);
router.post("/magic/:token", magicLinkAuth);
router.post("/register", register);

export default router;