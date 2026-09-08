import { config } from "dotenv";
import express from "express";
import multer from "multer";
import { globalErrorHandler } from "./utils/globalerrorHandler";
import authRoutes from "./routes/auth.routes";
import { connectDB } from "./config/database";

config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(multer().any());
app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.send("Hello from BBYDI website");
});

// ========== ROUTES =========== //
app.use("/auth", authRoutes);

// ========== Global error handler ============== //
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});