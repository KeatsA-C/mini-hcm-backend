import { db } from '../../lib/firebase.admin.js';

export async function addName(uid, firstName, lastName, email, department, role, timezone) {
  try {
    await db.collection('users').doc(uid).create({
      firstName,
      lastName,
      email,
      department,
      role,
      timezone,
    });

    return { success: true };
  } catch (error) {
    if (error.code === 6) {
      throw new Error(`email already exists.`);
    }
    throw new Error(`failed to add user: ${error.message}`);
  }
}
