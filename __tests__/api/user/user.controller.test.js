import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockAddUser = jest.fn();
const mockGetUser = jest.fn();
const mockGrantAdminRole = jest.fn();
const mockRevokeAdminRole = jest.fn();
const mockGetAllUsers = jest.fn();

jest.unstable_mockModule('../../../src/api/user/user.services.js', () => ({
  addUser: mockAddUser,
  getUser: mockGetUser,
  grantAdminRole: mockGrantAdminRole,
  revokeAdminRole: mockRevokeAdminRole,
  getAllUsers: mockGetAllUsers,
}));

// register() does a dynamic import of firebase.admin.js inside its body
const mockVerifyIdToken = jest.fn();
jest.unstable_mockModule('../../../src/lib/firebase.admin.js', () => ({
  auth: { verifyIdToken: mockVerifyIdToken },
  db: {},
}));

const { register, getUserDetails, listAllUsers, grantAdmin, revokeAdmin } =
  await import('../../../src/api/user/user.controller.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const VALID_BODY = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@doe.com',
  department: 'Engineering',
  position: 'Developer',
  timezone: 'Asia/Manila',
};

// ─── register ─────────────────────────────────────────────────────────────────

describe('register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when no Authorization header', async () => {
    const req = { headers: {}, body: {} };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockAddUser).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const req = { headers: { authorization: 'Basic abc' }, body: {} };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when required fields are missing', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid1' });
    const req = {
      headers: { authorization: 'Bearer tok' },
      body: { firstName: 'John' }, // missing lastName, email, department, position, timezone
    };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockAddUser).not.toHaveBeenCalled();
  });

  it('returns 201 on successful registration', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid1' });
    mockAddUser.mockResolvedValueOnce({ success: true });
    const req = { headers: { authorization: 'Bearer tok' }, body: VALID_BODY };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: 'Registration successful' });
    expect(mockAddUser).toHaveBeenCalledWith('uid1', expect.objectContaining(VALID_BODY));
  });

  it('returns 409 when email already exists', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid1' });
    mockAddUser.mockRejectedValueOnce(new Error('email already exists.'));
    const req = { headers: { authorization: 'Bearer tok' }, body: VALID_BODY };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 500 on unexpected service error', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'uid1' });
    mockAddUser.mockRejectedValueOnce(new Error('DB unavailable'));
    const req = { headers: { authorization: 'Bearer tok' }, body: VALID_BODY };
    const res = mockRes();
    await register(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── getUserDetails ───────────────────────────────────────────────────────────

describe('getUserDetails', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with user data', async () => {
    const user = { uid: 'u1', firstName: 'Alice', role: 'user' };
    mockGetUser.mockResolvedValueOnce(user);
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await getUserDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(user);
  });

  it('returns 500 on service error', async () => {
    mockGetUser.mockRejectedValueOnce(new Error('User not found'));
    const req = { user: { uid: 'u1' } };
    const res = mockRes();
    await getUserDetails(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── listAllUsers ─────────────────────────────────────────────────────────────

describe('listAllUsers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 200 with array of users', async () => {
    const users = [{ uid: 'a' }, { uid: 'b' }];
    mockGetAllUsers.mockResolvedValueOnce(users);
    const req = {};
    const res = mockRes();
    await listAllUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(users);
  });

  it('returns 500 on service error', async () => {
    mockGetAllUsers.mockRejectedValueOnce(new Error('DB error'));
    const req = {};
    const res = mockRes();
    await listAllUsers(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── grantAdmin ───────────────────────────────────────────────────────────────

describe('grantAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when uid is missing from body', async () => {
    const req = { body: {} };
    const res = mockRes();
    await grantAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockGrantAdminRole).not.toHaveBeenCalled();
  });

  it('returns 200 with updated role on success', async () => {
    mockGrantAdminRole.mockResolvedValueOnce({ uid: 'u1', role: 'admin' });
    const req = { body: { uid: 'u1' } };
    const res = mockRes();
    await grantAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Admin role granted', uid: 'u1', role: 'admin' }),
    );
  });

  it('returns 404 when target user is not found', async () => {
    mockGrantAdminRole.mockRejectedValueOnce(new Error('Target user not found'));
    const req = { body: { uid: 'ghost' } };
    const res = mockRes();
    await grantAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 on other errors (e.g. cannot change superadmin)', async () => {
    mockGrantAdminRole.mockRejectedValueOnce(new Error('Cannot change superadmin role'));
    const req = { body: { uid: 'su1' } };
    const res = mockRes();
    await grantAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ─── revokeAdmin ──────────────────────────────────────────────────────────────

describe('revokeAdmin', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when uid is missing', async () => {
    const req = { body: {} };
    const res = mockRes();
    await revokeAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 200 with reverted role on success', async () => {
    mockRevokeAdminRole.mockResolvedValueOnce({ uid: 'u1', role: 'user' });
    const req = { body: { uid: 'u1' } };
    const res = mockRes();
    await revokeAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Admin role revoked', uid: 'u1', role: 'user' }),
    );
  });

  it('returns 404 when target user is not found', async () => {
    mockRevokeAdminRole.mockRejectedValueOnce(new Error('Target user not found'));
    const req = { body: { uid: 'ghost' } };
    const res = mockRes();
    await revokeAdmin(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
