import express from "express";
const app = express();
import { engine } from "express-handlebars";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { ApiError } from "./utils/ApiError.js";
//routes import
import userRouter from "./routes/user.routes.js";

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
// Configure Express Handlebars

app.engine("handlebars", engine());
app.set("view engine", "handlebars");

// Set views directory
const __dirname = dirname(fileURLToPath(import.meta.url));
app.set("views", path.join(__dirname, "views"));

//routes declaration
app.use("/api/v1", userRouter);

app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      status: err.statusCode,
      message: err.message,
      errors: err.errors,
    });
  } else {
    res.status(500).json({
      status: 500,
      message: "Internal Server Error",
      errors: [err],
    });
  }
});

export { app };
