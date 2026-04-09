import { catchAsyncController } from '@/utils/catchAsync';

export const getImageMeta = catchAsyncController(async (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});
