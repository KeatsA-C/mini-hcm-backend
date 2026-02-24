import { db, auth } from '../../lib/firebase.admin.js';

// Valid roles
export const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin', SUPERADMIN: 'superadmin' });

/**
 * Creates a Firestore user document after Firebase Auth registration.
 * Default role is 'user'. Sets matching custom claim for middleware checks.
 */
export async function addUser(
  uid,
  { firstName, lastName, email, department, position, timezone, schedule },
) {
  try {
    const role = ROLES.USER;

    await db
      .collection('users')
      .doc(uid)
      .create({
        firstName,
        lastName,
        email,
        department,
        position,
        timezone,
        role,
        schedule: {
          start: schedule?.start ?? '09:00',
          end: schedule?.end ?? '18:00',
        },
        createdAt: new Date().toISOString(),
      });

    // Sync role to Firebase custom claims so middleware can read it from the token
    await auth.setCustomUserClaims(uid, { role });

    return { success: true };
  } catch (error) {
    if (error.code === 6) throw new Error('email already exists.');
    throw new Error(`Failed to add user: ${error.message}`);
  }
}

export async function getUser(uid) {
  try {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) throw new Error('User not found');
    return { uid, ...doc.data() };
  } catch (error) {
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

/**
 * Grants admin role to a target user (callable by superadmin only).
 * Updates both Firestore and Firebase custom claims.
 */
export async function grantAdminRole(targetUid) {
  const doc = await db.collection('users').doc(targetUid).get();
  if (!doc.exists) throw new Error('Target user not found');

  const currentRole = doc.data().role;
  if (currentRole === ROLES.SUPERADMIN) throw new Error('Cannot change superadmin role');

  await db.collection('users').doc(targetUid).update({ role: ROLES.ADMIN });
  await auth.setCustomUserClaims(targetUid, { role: ROLES.ADMIN });
  return { uid: targetUid, role: ROLES.ADMIN };
}

/**
 * Revokes admin role from a target user (back to 'user').
 * Callable by superadmin only.
 */
export async function revokeAdminRole(targetUid) {
  const doc = await db.collection('users').doc(targetUid).get();
  if (!doc.exists) throw new Error('Target user not found');

  const currentRole = doc.data().role;
  if (currentRole === ROLES.SUPERADMIN) throw new Error('Cannot change superadmin role');

  await db.collection('users').doc(targetUid).update({ role: ROLES.USER });
  await auth.setCustomUserClaims(targetUid, { role: ROLES.USER });
  return { uid: targetUid, role: ROLES.USER };
}

/**
 * Returns all non-superadmin users (for admin/superadmin use).
 */
export async function getAllUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }));
}
