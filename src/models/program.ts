import mongoose, { Model, Schema } from "mongoose";
import { UserType } from "./user";

export type IProgram = {
  title: string;
  description: string;
  image: string | null;
  category: string;
  postedBy: UserType;
  approved: boolean;
  updatedBy?: UserType[];
  isDeleted?: boolean;
}

const ProgramSchema = new Schema<IProgram>({
  title: {
    type: String,
    required: true,
    unique: true,
  },
  description: String,
  image: {
    type: String,
    default: null,
  },
  category: {
    type: String,
    unique: true
  },
  postedBy: {
    type: mongoose.Types.ObjectId,
    ref: "User"
  },
  approved: {
    type: Boolean,
    default: false
  },
  updatedBy: [{
    type: mongoose.Types.ObjectId,
    ref: "User",
    select: false
  }],
  isDeleted: {
    type: Boolean,
    default: false,
    select: false
  }
}, { timestamps: true });

const Program: Model<IProgram> = mongoose.model<IProgram>("Program", ProgramSchema);
export default Program;