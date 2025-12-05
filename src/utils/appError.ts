class AppError extends Error {
  statusCode: number;
  status: string;
  isOperated: boolean;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${this.statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperated = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
