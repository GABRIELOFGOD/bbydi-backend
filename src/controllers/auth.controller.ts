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

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: "Invalid email address" });
  }

  const user = await User.findOne({ email });
  if (user) {
    const magicToken = tokenGenerator({ userId: user._id }, process.env.MAGIC_SECRET!, process.env.MAGIC_EXPIRATION!);
    const magicLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${magicToken}`;
    await magicMailer(user.email, magicLink);
  }

  return res.status(HTTP_STATUS.OK).json({ message: "If an account exists for this email, a password reset link has been sent" });
});

export const updateCurrentUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to your account");

  const { name, email, position, avatar, bio } = req.body;
  if (bio !== undefined && req.user?.role !== UserRole.ADMIN) {
    return responder(res, HTTP_STATUS.FORBIDDEN, "Only administrators can update biographies");
  }
  if (email !== undefined && !isValidEmail(email)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please provide a valid email address");
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Name cannot be empty");
  }
  for (const [field, value, limit] of [
    ["position", position, 200],
    ["avatar", avatar, 2000],
    ["bio", bio, 5000],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.length > limit)) {
      return responder(res, HTTP_STATUS.BAD_REQUEST, `${field} must be text no longer than ${limit} characters`);
    }
  }

  const user = await User.findById(userId);
  if (!user) return responder(res, HTTP_STATUS.NOT_FOUND, "User account not found");

  if (email && email !== user.email) {
    const duplicate = await User.findOne({ email, _id: { $ne: userId } });
    if (duplicate) return responder(res, HTTP_STATUS.CONFLICT, "That email address is already in use");
    user.email = email;
  }
  if (name !== undefined) user.name = name.trim();
  if (position !== undefined) user.position = position;
  if (avatar !== undefined) user.avatar = avatar;
  if (bio !== undefined) user.bio = bio;

  await user.save();
  const safeUser = { ...user.toObject(), password: undefined, createdBy: undefined };
  return res.status(HTTP_STATUS.OK).json({ message: "Profile updated", user: safeUser });
});

export const changeCurrentPassword = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  if (!userId) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to your account");

  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Enter your current password and a new password");
  }
  if (!isStrongPassword(newPassword)) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Please choose a stronger password");
  }

  const user = await User.findById(userId).select("+password");
  if (!user || !user.password) return responder(res, HTTP_STATUS.NOT_FOUND, "User account not found");
  if (!(await comparePassword(currentPassword, user.password))) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "Current password is incorrect");
  }

  user.password = await hashPassword(newPassword);
  await user.save();
  return res.status(HTTP_STATUS.OK).json({ message: "Password updated successfully" });
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