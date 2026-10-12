import { config } from "dotenv";
import express from "express";
import morgan from "morgan";
import cors from "cors"
import { globalErrorHandler } from "./utils/globalerrorHandler";
import { connectDB } from "./config/database";
import authRoutes from "./routes/auth.routes";
import programRoutes from "./routes/program.routes";
import projectRoutes from "./routes/project.routes";
import staffRoutes from "./routes/staff.routes";
import contentRoutes from "./routes/content.routes";
import contactRoutes from "./routes/contact.routes";
import notificationRoutes from "./routes/notification.routes";
import { migrateLegacyContent } from "./seed/migrateLegacyContent";

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

app.get("/", (req, res) => {
  res.send("Hello from BBYDI website");
});

// ========== ROUTES =========== //
app.use("/api/auth", authRoutes);
app.use("/api/program", programRoutes);
app.use("/api/project", projectRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/notifications", notificationRoutes);

// ========== Global error handler ============== //
app.use(globalErrorHandler);

const startServer = async () => {
  await connectDB();
  await migrateLegacyContent();
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
};

void startServer().catch((error: unknown) => {
  console.error("Server startup failed", error);
  process.exitCode = 1;
});