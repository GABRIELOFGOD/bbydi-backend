import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { catchAsync } from "../utils/catchAsync";
import User, { UserType } from "../models/user";

declare global {
  namespace Express {
    interface Request {
      user?: UserType;
    }
  }
}

export const authMiddleware = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token is required" });
  }

  const token = authorization.slice(7).trim();
  const secret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ message: "Authorization token is required" });
  }

  if (!secret) {
    return res.status(500).json({ message: "JWT secret is not configured" });
  }

  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;

    if (typeof payload.userId !== "string") {
      return res.status(401).json({ message: "Invalid authorization token" });
    }

    const user = await User.findById(payload.userId).select("+password");

    if (!user) {
      return res.status(401).json({ message: "User account not found" });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: "Please verify your account" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ message: "Your account has been blocked" });
    }

    req.user = user.toObject() as UserType;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired authorization token" });
  }
});