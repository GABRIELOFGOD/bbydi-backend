import { compare, hash } from "bcryptjs";
import { Response } from "express";
import * as jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary";
import multer from "multer";
import { unlink } from "node:fs/promises";
// import * as bcrypt from "bcryptjs";


const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }
});

export const upload = multer({ storage: storage });

const allowedContentTypes: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  document: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

export const contentUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 2,
    fieldSize: 1024 * 1024,
    fields: 30,
    parts: 32,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedContentTypes[file.fieldname]?.includes(file.mimetype)) {
      const error = new Error(`Unsupported ${file.fieldname} file type`) as Error & { statusCode: number };
      error.statusCode = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

export const createMagicLink = (userId: string, token: string): string => {
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${baseUrl}/auth/magic-link?userId=${userId}&token=${token}`;
}

export const tokenGenerator = (payload: object, secret: string, expiresIn: string): string => {
  const jwt = require("jsonwebtoken");
  return jwt.sign(payload, secret, { expiresIn });
}

export const tokenValidator = (token: string, secret: string) => {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    throw error;
  }
}

export const responder = (res: Response, status: number, message: string) => {
  try {
    return res.status(status).json({ message });
  } catch (error) {
    throw error;
  }
}

export const hashPassword = async (password: string) => {
  return await hash(password, 10);
}

export const comparePassword = async (password: string, hashedPassword: string) => {
  return await compare(password, hashedPassword);
}

export const fileUploader = async (
  files: Express.Multer.File[],
  resourceType: "image" | "raw" = "image",
): Promise<string[]> => {
  const urls: string[] = [];
  for (const file of files) {
    try {
      const result = await cloudinary.uploader.upload(file.path, { resource_type: resourceType });
      urls.push(result.secure_url);
    } finally {
      await unlink(file.path);
    }
  }
  return urls;
}
