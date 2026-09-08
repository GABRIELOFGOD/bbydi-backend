import mongoose from "mongoose";

export const connectDB = async () => {
  await mongoose.connect(process.env.DATABASE_URL!).then(data => {
    console.log("Database connected successfully");
  }).catch(err => {
    console.log("Error connecting to Database, please try again later", err);
  })
};