import { auth } from '../../lib/firebase.admin.js';
import { addName } from './user.services.js';

export async function register(req, res, next) {
  console.log('registration triggered');
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { firstName, lastName, email, department, role, timezone } = req.body;

    if (!firstName || !lastName || !email || !department || !role || !timezone) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    await addName(uid, firstName, lastName, email, department, role, timezone);

    res.status(201).json({ message: 'registration successful' });
  } catch (error) {
    const message = error.message || 'Internal Server Error';
    const status = message.includes('already exists') ? 409 : 500;
    res.status(status).json({ error: message });
  }
}
