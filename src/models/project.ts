import mongoose, { Model, Schema } from "mongoose";
import { UserType } from "./user";
import { IProgram } from "./program";

export type IProject = {
  title: string;
  description: string;
  image: string | null;
  category: string;
  program: IProgram;
  postedBy: UserType;
  approved: boolean;
  updatedBy?: UserType[];
  isDeleted?: boolean;
};

const ProjectSchema = new Schema<IProject>({
  title: {
    type: String,
    required: true,
  },
  description: String,
  image: {
    type: String,
    default: null,
  },
  category: {
    type: String,
    required: true,
  },
  program: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Program",
    required: true,
  },
  postedBy: {
    type: mongoose.Types.ObjectId,
    ref: "User",
  },
  approved: {
    type: Boolean,
    default: false,
  },
  updatedBy: [{
    type: mongoose.Types.ObjectId,
    ref: "User",
    select: false,
  }],
  isDeleted: {
    type: Boolean,
    default: false,
    select: false,
  },
}, { timestamps: true });

const Project: Model<IProject> = mongoose.model<IProject>("Project", ProjectSchema);
export default Project;