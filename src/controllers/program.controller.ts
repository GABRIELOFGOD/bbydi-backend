import { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { fileUploader, responder } from "../utils/helper";
import HTTP_STATUS from "../utils/statusCode";
import { UserRole } from "../utils/types";
import Program, { IProgram } from "../models/program";

export const createProgram = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");

  const { title, description, category } = req.body;

  if (!title) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter at least program title");

  if (!category) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter category slug");

  if (!req.file) return responder(res, HTTP_STATUS.BAD_REQUEST, "Program image is required");

  const imageUrls = await fileUploader([req.file]);
  if (imageUrls.length < 1) return responder(res, HTTP_STATUS.SERVICE_UNAVAILABLE, "An error occure while trying to upload image, please try again later");

  let approved: boolean;

  if (user.role === UserRole.ADMIN) {
    approved = true;
  } else {
    approved = false;
  }

  const newProgram = await Program.create({ approved, title, description, category, image: imageUrls[0], postedBy: user });

  return res.status(HTTP_STATUS.CREATED).json({ message: "Program created", data: newProgram });
});

export const getPrograms = catchAsync(async (req: Request, res: Response) => {
  const data = await Program.find({ approved: true, isDeleted: { $ne: true } });
  return res.status(HTTP_STATUS.OK).json(data);
});

export const getAllPrograms = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry you are not allowed to access this resources");
  let data: IProgram[];
  if (user.role === UserRole.ADMIN) {
    data = await Program.find({ isDeleted: { $ne: true } }).select("+updatedBy");
  } else {
    data = await Program.find({ isDeleted: { $ne: true } });
  }
  return res.status(HTTP_STATUS.OK).json(data);
});

export const getOneProgram = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const program = await Program.findOne({ _id: id, approved: true, isDeleted: { $ne: true } });
  return res.status(HTTP_STATUS.OK).json(program);
});

export const updateOneProgram = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== UserRole.ADMIN) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry, you are not permitted to perform this operation");

  const { id } = req.params;
  const { title, description, approved } = req.body;
  const updates: Partial<IProgram> = {};

  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (approved !== undefined) updates.approved = approved;

  if (req.file) {
    const imageUrls = await fileUploader([req.file]);
    if (imageUrls.length < 1) {
      return responder(res, HTTP_STATUS.SERVICE_UNAVAILABLE, "An error occure while trying to upload image, please try again later");
    }
    updates.image = imageUrls[0];
  }

  const program = await Program.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
  if (!program) return responder(res, HTTP_STATUS.NOT_FOUND, "Program not found");

  return res.status(HTTP_STATUS.OK).json({ message: "Program updated", data: program });
});

export const deleteProgram = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== UserRole.ADMIN) {
    return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry, you are not permitted to perform this operation");
  }

  const { id } = req.params;
  const program = await Program.findOneAndUpdate(
    { _id: id, isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true },
  );

  if (!program) return responder(res, HTTP_STATUS.NOT_FOUND, "Program not found");

  return res.status(HTTP_STATUS.OK).json({ message: "Program deleted", data: program });
});
