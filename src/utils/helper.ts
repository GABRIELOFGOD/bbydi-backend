import { compare, hash } from "bcryptjs";
import { Response } from "express";
import * as jwt from "jsonwebtoken";
// import * as bcrypt from "bcryptjs";

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
