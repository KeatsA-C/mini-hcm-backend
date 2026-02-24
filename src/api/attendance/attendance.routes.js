import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import {
  handlePunchIn,
  handlePunchOut,
  getPunchStatusHandler,
  cancelOpenPunchHandler,
  getHistory,
  getDailySummaryHandler,
  getWeeklySummaryHandler,
} from './attendance.controller.js';

const router = Router();

// All attendance routes require authentication
router.use(authenticate);

router.get('/status', getPunchStatusHandler); // current punch state
router.post('/punch-in', handlePunchIn);
router.post('/punch-out', handlePunchOut);
router.delete('/cancel-punch/:attendanceId', cancelOpenPunchHandler); // void accidental punch-in
router.get('/history', getHistory);
router.get('/summary/daily', getDailySummaryHandler);
router.get('/summary/weekly', getWeeklySummaryHandler);

export default router;
