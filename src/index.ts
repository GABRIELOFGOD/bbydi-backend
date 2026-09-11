import { config } from "dotenv";
import express from "express";
import morgan from "morgan";
import cors from "cors"
import { globalErrorHandler } from "./utils/globalerrorHandler";
import { connectDB } from "./config/database";
import authRoutes from "./routes/auth.routes";
import programRoutes from "./routes/program.routes";

config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

app.use(morgan("dev"));

connectDB();

app.get("/", (req, res) => {
  res.send("Hello from BBYDI website");
});

// ========== ROUTES =========== //
app.use("/api/auth", authRoutes);
app.use("/api/program", programRoutes);

// ========== Global error handler ============== //
app.use(globalErrorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});