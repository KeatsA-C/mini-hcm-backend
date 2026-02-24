import admin from 'firebase-admin';
import { readFileSync } from 'fs';

try {
  const serviceAccount = JSON.parse(
    // readFileSync(new URL('../../etc/secrets/firebase.json', import.meta.url)),
    readFileSync(new URL('/etc/secrets/firebase.json', import.meta.url)),
  );

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log('Firebase Admin initialized successfully.');
} catch (error) {
  console.error(
    'Firebase Admin initialization error. Check your firebase.json file.',
    error.message,
  );
}

export const db = admin.firestore();
export const auth = admin.auth();
export { admin };
