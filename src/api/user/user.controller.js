import { authenticate, requireRole } from '../../middleware/auth.middleware.js';
import { addUser, getUser, grantAdminRole, revokeAdminRole, getAllUsers } from './user.services.js';

export async function register(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Re-use authenticate logic inline here since registration isn't behind middleware
    const { auth } = await import('../../lib/firebase.admin.js');
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { firstName, lastName, email, department, position, timezone, schedule } = req.body;

    if (!firstName || !lastName || !email || !department || !position || !timezone) {
      return res
        .status(400)
        .json({ error: 'firstName, lastName, email, department, position, timezone are required' });
    }

    await addUser(uid, { firstName, lastName, email, department, position, timezone, schedule });

    res.status(201).json({ message: 'Registration successful' });
  } catch (error) {
    const message = error.message || 'Internal Server Error';
    const status = message.includes('already exists') ? 409 : 500;
    res.status(status).json({ error: message });
  }
}

export async function getUserDetails(req, res) {
  try {
    const user = await getUser(req.user.uid);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/** GET /api/user/all — admin/superadmin view of all users */
export async function listAllUsers(req, res) {
  try {
    const users = await getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

/** POST /api/user/grant-admin  body: { uid } */
export async function grantAdmin(req, res) {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    const result = await grantAdminRole(uid);
    res.status(200).json({ message: `Admin role granted`, ...result });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
}

/** POST /api/user/revoke-admin  body: { uid } */
export async function revokeAdmin(req, res) {
  try {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid is required' });
    const result = await revokeAdminRole(uid);
    res.status(200).json({ message: `Admin role revoked`, ...result });
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 400;
    res.status(status).json({ error: error.message });
  }
}

export { authenticate, requireRole };
