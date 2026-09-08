import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";

export const isFree = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
  const { token } = req.headers;
});