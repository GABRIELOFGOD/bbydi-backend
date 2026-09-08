import mongoose, { Model, Schema } from "mongoose";
import { UserRole } from "../utils/types";

export type UserType = {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  isVerified: boolean;
  isBlocked: boolean;
};

const UserSchema: Schema<UserType> = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true
    },
    password: {
      type: String,
      select: false
    },
    role: {
      type: String,
      enum: Object.values(UserRole),
      default: UserRole.STAFF
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    isBlocked: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const User: Model<UserType> = mongoose.model<UserType>("User", UserSchema);
export default User;
