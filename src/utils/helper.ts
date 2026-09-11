import { compare, hash } from "bcryptjs";
import { Response } from "express";
import * as jwt from "jsonwebtoken";
import cloudinary from "../config/cloudinary";
import multer from "multer";
// import * as bcrypt from "bcryptjs";


const storage = multer.diskStorage({
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

export const upload = multer({ storage: storage });

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

export const fileUploader = async (files: Express.Multer.File[]): Promise<string[]> => {
  try {
    const urls: string[] = [];
    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path);
      urls.push(result.secure_url);
    }

    return urls
  } catch (error) {
    throw error;
  }
}
