import { Router } from 'express';
import {
  register,
  getUserDetails,
  listAllUsers,
  grantAdmin,
  revokeAdmin,
} from './user.controller.js';
import { authenticate, requireRole } from '../../middleware/auth.middleware.js';

const router = Router();

// Public-ish registration (requires valid Firebase token, but no role check)
router.post('/registration', register);

// Authenticated user routes
router.get('/details', authenticate, getUserDetails);
router.get('/all', authenticate, requireRole('admin', 'superadmin'), listAllUsers);

// Superadmin-only role management
router.post('/grant-admin', authenticate, requireRole('superadmin'), grantAdmin);
router.post('/revoke-admin', authenticate, requireRole('superadmin'), revokeAdmin);

export default router;
