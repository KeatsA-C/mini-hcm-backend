import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import {
  getEmployeePunchesHandler,
  editPunchHandler,
  deletePunchHandler,
  assignScheduleHandler,
  dailyReportHandler,
  weeklyReportHandler,
} from './admin.controller.js';

const router = Router();

// All admin routes require authentication + admin or superadmin role
router.use(authenticate, requireRole('admin', 'superadmin'));

// Punch management
router.get('/punches/:uid', getEmployeePunchesHandler);
router.put('/punches/:punchId', editPunchHandler);
router.delete('/punches/:punchId', deletePunchHandler);

// Schedule management
router.put('/schedule/:uid', assignScheduleHandler);

// Reports
router.get('/reports/daily', dailyReportHandler);
router.get('/reports/weekly', weeklyReportHandler);

export default router;
