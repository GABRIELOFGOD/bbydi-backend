import { Request, Response } from "express";
import mongoose from "mongoose";
import { catchAsync } from "../utils/catchAsync";
import { fileUploader, responder } from "../utils/helper";
import HTTP_STATUS from "../utils/statusCode";
import { UserRole } from "../utils/types";
import Project, { IProject } from "../models/project";
import Program, { IProgram } from "../models/program";

const findProgramForProject = async (programId: string, category: string) => {
  if (!mongoose.Types.ObjectId.isValid(programId)) return null;
  return Program.findOne({ _id: programId, category, isDeleted: { $ne: true } });
};

const getApprovedProgramIds = async (): Promise<mongoose.Types.ObjectId[]> => {
  const programs = await Program.find({ approved: true, isDeleted: { $ne: true } }).select("_id");
  return programs.map((program) => program._id as mongoose.Types.ObjectId);
};

export const createProject = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Please login to perform this operation");

  const { title, description, category, program } = req.body;
  if (!title) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter at least project title");
  if (!category) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please enter project category");
  if (!program) return responder(res, HTTP_STATUS.BAD_REQUEST, "Please select a program");
  if (!req.file) return responder(res, HTTP_STATUS.BAD_REQUEST, "Project image is required");

  const parentProgram = await findProgramForProject(program, category);
  if (!parentProgram) {
    return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected program does not use this category");
  }

  const imageUrls = await fileUploader([req.file]);
  if (imageUrls.length < 1) return responder(res, HTTP_STATUS.SERVICE_UNAVAILABLE, "An error occure while trying to upload image, please try again later");

  const approved = user.role === UserRole.ADMIN;
  const newProject = await Project.create({ approved, title, description, category, program, image: imageUrls[0], postedBy: user });

  return res.status(HTTP_STATUS.CREATED).json({ message: "Project created", data: newProject });
});

export const getProjects = catchAsync(async (_req: Request, res: Response) => {
  const programIds = await getApprovedProgramIds();
  const data = await Project.find({
    approved: true,
    program: { $in: programIds as any },
    isDeleted: { $ne: true },
  } as any)
    .populate("program")
    .populate("postedBy", "name email");
  return res.status(HTTP_STATUS.OK).json(data);
});

export const getAllProjects = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry you are not allowed to access this resources");

  const query = Project.find({ isDeleted: { $ne: true } }).populate("program").populate("postedBy", "name email");
  if (user.role === UserRole.ADMIN) query.select("+updatedBy");

  const data = await query;
  return res.status(HTTP_STATUS.OK).json(data);
});

export const getOneProject = catchAsync(async (req: Request, res: Response) => {
  const programIds = await getApprovedProgramIds();
  const project = await Project.findOne({
    _id: req.params.id,
    approved: true,
    program: { $in: programIds as any },
    isDeleted: { $ne: true },
  } as any)
    .populate("program")
    .populate("postedBy", "name email");
  if (!project) return responder(res, HTTP_STATUS.NOT_FOUND, "Project not found");
  return res.status(HTTP_STATUS.OK).json(project);
});

export const updateOneProject = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== UserRole.ADMIN) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry, you are not permitted to perform this operation");

  const currentProject = await Project.findOne({ _id: req.params.id, isDeleted: { $ne: true } });
  if (!currentProject) return responder(res, HTTP_STATUS.NOT_FOUND, "Project not found");

  const { title, description, category, program, approved } = req.body;
  const updates: Partial<IProject> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (approved !== undefined) updates.approved = approved;

  const nextCategory = category ?? currentProject.category;
  const nextProgram = program ?? currentProject.program.toString();
  if (category !== undefined || program !== undefined) {
    const parentProgram = await findProgramForProject(nextProgram, nextCategory);
    if (!parentProgram) return responder(res, HTTP_STATUS.BAD_REQUEST, "The selected program does not use this category");
    updates.category = nextCategory;
    updates.program = parentProgram._id as unknown as IProgram;
  }

  if (req.file) {
    const imageUrls = await fileUploader([req.file]);
    if (imageUrls.length < 1) return responder(res, HTTP_STATUS.SERVICE_UNAVAILABLE, "An error occure while trying to upload image, please try again later");
    updates.image = imageUrls[0];
  }

  const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).populate("program");
  return res.status(HTTP_STATUS.OK).json({ message: "Project updated", data: project });
});

export const deleteProject = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== UserRole.ADMIN) return responder(res, HTTP_STATUS.UNAUTHORIZED, "Sorry, you are not permitted to perform this operation");

  const project = await Project.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true },
  );
  if (!project) return responder(res, HTTP_STATUS.NOT_FOUND, "Project not found");

  return res.status(HTTP_STATUS.OK).json({ message: "Project deleted", data: project });
});