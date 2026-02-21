import { Router } from 'express';
import { register } from './user.controller.js';

const router = Router();

router.post('/registration', register);

export default router;
