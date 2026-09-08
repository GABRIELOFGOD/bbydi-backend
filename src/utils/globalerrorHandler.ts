export const globalErrorHandler = (err: any, req: any, res: any, next: any) => {
  console.error(err.stack || err);

  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors || {})
      .map((error: any) => error.message)
      .join(", ");
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field
      ? `${field} already exists`
      : "A record with the provided value already exists";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path || "value"}: ${err.value}`;
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token has expired";
  }

  res.status(statusCode).json({
    status: statusCode >= 500 ? "error" : "fail",
    message,
  });
};