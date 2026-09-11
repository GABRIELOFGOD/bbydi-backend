import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { responder } from "../utils/helper";
import HTTP_STATUS from "../utils/statusCode";

export const userProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return responder(res, HTTP_STATUS.NOT_FOUND, "Please login to your account");
  return res.status(HTTP_STATUS.OK).json({ message: "User data fetched", user });
});