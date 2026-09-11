import { NextFunction, Request, Response } from "express";
import { UserRole } from "../utils/types";

export const authorizeRoles = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication is required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }

    return next();
  };
};