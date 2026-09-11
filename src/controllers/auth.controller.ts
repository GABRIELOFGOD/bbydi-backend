import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { isValidEmail } from "../utils/customValidators";
import { isStrongPassword } from "validator";
import HTTP_STATUS from "../utils/statusCode";
import UserModel from "../models/user";
import { UserRole } from "../utils/types";
import { comparePassword, hashPassword, responder, tokenGenerator, tokenValidator } from "../utils/helper";
import { magicMailer } from "../utils/mailer";
import User from "../models/user";

export const register = catchAsync(async (req: Request, res: Response) => {
  const { email, name } = req.body;

  if (!isValidEmail(email)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Invalid email address" });
  }

  // const hasStrongPassword = isStrongPassword(password);
  // if (!hasStrongPassword) {
  //   return res.status(HTTP_STATUS.BAD_GATEWAY).json({ message: "Password must be at least 8 characters long and contain a number, a lowercase letter, and an uppercase letter" });
  // }

  const user = await UserModel.findOne({ email });
  if (user) {
    return res.status(HTTP_STATUS.CONFLICT).json({ message: "User already exists" });
  }

  const newUser = await UserModel.create({ email, name, role: UserRole.STAFF, createdBy: req.user });
  const magicToken = tokenGenerator({ userId: newUser._id }, process.env.MAGIC_SECRET!, process.env.MAGIC_EXPIRATION!);
  const magicLink = `${process.env.FRONTEND_URL}/auth/magic?token=${magicToken}`;

  await magicMailer(newUser.email, magicLink);

  return res.status(HTTP_STATUS.CREATED).json({ message: "User registered successfully", user: newUser });
});

export const magicLinkAuth = catchAsync(async (req: Request, res: Response) => {
  const { token } = req.params;
  const { password } = req.body;

  if (typeof token !== "string" || !token) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Invalid token" });
  }
  const decodedToken = tokenValidator(token, process.env.MAGIC_SECRET!);

  if (!password) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Please enter password" });
  if (!isStrongPassword(password)) return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Please enter a stronger password" });

  if (!decodedToken || typeof decodedToken === "string" || !decodedToken.userId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Token validation failed, please try again" });
  }

  const user = await User.findById(decodedToken.userId);
  if (!user) return res.status(HTTP_STATUS.BAD_GATEWAY).json({ message: "Link might have been altered, please recheck the link or click directly from the email sent to you" });

  if (user.isBlocked) return responder(res, HTTP_STATUS.BAD_REQUEST, "This account has been blocked, please reach out to an administrator to unblock your account");

  const hashedPassword = await hashPassword(password);
  
  user.password = hashedPassword;
  user.isVerified = true;
  await user.save();

  return res.status(HTTP_STATUS.OK).json({
    message: "User information updated successfully",
    user,
  });


});

export const login = catchAsync(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");
  if (!user) return responder(res, HTTP_STATUS.BAD_REQUEST, "Invalid credentials");

  if (!user.isVerified) return responder(res, HTTP_STATUS.FORBIDDEN, "Please verify user account using the link sent to email");

  const isCorrectPassword = await comparePassword(password, user.password);
  if (!isCorrectPassword) return responder(res, HTTP_STATUS.BAD_REQUEST, "Invalid credentials")

  if (user.isBlocked) return responder(res, HTTP_STATUS.FORBIDDEN, "This user account has been blocked, please reach out to an administrator to remove the restrictions");

  const token = tokenGenerator({ userId: user.id }, process.env.JWT_SECRET!, "100d");

  res.status(HTTP_STATUS.OK).json({ message: "Login successful", token });

});