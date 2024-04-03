const HttpError = require("../models/HttpError");

const handleDuplicateKeyError = (error) => {
  const fieldName = Object.keys(error.keyValue)[0];
  // Improved regex to handle extraction more reliably and avoid potential null matches
  const value = error.message.match(/(["'])(?:(?=(\\?))\2.)*?\1/)[0];
  const message = `The ${fieldName} '${value}' is already used. Please use another ${fieldName}.`;
  return new HttpError(message, 400); // 400 Bad Request
};

const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new HttpError(message, 400); // 400 Bad Request
};

const handleInvalidIdError = () =>
  new HttpError("Invalid ID. The ID does not exist.", 400);

const handleError = (error, isDevelopment) => {
  if (isDevelopment) {
    return {
      status: error.statusCode || 500,
      body: {
        message: error.message || "An unknown error occurred",
        stack: error.stack,
        error,
      },
    };
  }

  if (error.isOperational) {
    return {
      status: error.statusCode || 500,
      body: {
        message: error.message || "An unknown error occurred",
      },
    };
  }

  // console.error("ERROR 💥", error); // Log the error for the developer
  return {
    status: 500,
    body: {
      message: "An unknown error occurred",
    },
  };
};

const notFoundError = (req, res, next) => {
  console.log(req.url);
  next(new HttpError("Could not find this route.", 404));
};

const globalErrorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  console.log(error);
  const isDevelopment = process.env.NODE_ENV === "development";
  let err = { ...error, message: error.message };

  switch (error.name) {
    case "ValidationError":
      err = handleValidationError(error);
      break;
    case "CastError":
      err = handleInvalidIdError();
      break;
    default:
      if (error.code === 11000) err = handleDuplicateKeyError(error);
      break;
  }

  const { status, body } = handleError(err, isDevelopment);
  res.status(status).json(body);
};

module.exports = { notFoundError, globalErrorHandler };
