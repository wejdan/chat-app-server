class HttpError extends Error {
  constructor(message, statusCode) {
    super(message); // Call the parent class constructor with the message
    this.statusCode = statusCode; // Add a statusCode property
    this.name = this.constructor.name; // Set the error name to the class name
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor); // Capture the stack trace
  }
}

module.exports = HttpError;
