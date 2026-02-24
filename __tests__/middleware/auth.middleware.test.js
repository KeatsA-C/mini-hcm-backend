/**
 * Unit tests for auth middleware:
 *   - authenticate: verifies Firebase JWT and attaches req.user
 *   - requireRole:  guards routes by role claim
 *
 * firebase.admin.js is fully mocked — no Firebase project needed.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ─── Mocks (must be declared before dynamic import of the module under test) ──

const mockVerifyIdToken = jest.fn();

jest.unstable_mockModule('../../src/lib/firebase.admin.js', () => ({
  auth: { verifyIdToken: mockVerifyIdToken },
  db: {},
}));

// Dynamic import AFTER mocking so the middleware picks up the mock
const { authenticate, requireRole } = await import('../../src/middleware/auth.middleware.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext = jest.fn();

// ─── authenticate ─────────────────────────────────────────────────────────────

describe('authenticate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when Authorization header is absent', async () => {
    const req = { headers: {} };
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with "Bearer "', async () => {
    const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 when verifyIdToken throws (expired / invalid token)', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('Token expired'));
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('calls next() and sets req.user on a valid token', async () => {
    const decoded = { uid: 'user123', email: 'alice@example.com', role: 'user' };
    mockVerifyIdToken.mockResolvedValueOnce(decoded);
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = mockRes();
    await authenticate(req, res, mockNext);
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token');
    expect(req.user).toEqual(decoded);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── requireRole ──────────────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 403 when user role is not in the allowed list', () => {
    const guard = requireRole('admin', 'superadmin');
    const req = { user: { role: 'user' } };
    const res = mockRes();
    guard(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('calls next() when user role exactly matches one allowed role', () => {
    const guard = requireRole('admin', 'superadmin');
    const req = { user: { role: 'admin' } };
    const res = mockRes();
    guard(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next() for superadmin', () => {
    const guard = requireRole('admin', 'superadmin');
    const req = { user: { role: 'superadmin' } };
    const res = mockRes();
    guard(req, res, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('defaults req.user.role to "user" when the property is missing', () => {
    const guard = requireRole('admin');
    const req = { user: {} }; // no role field
    const res = mockRes();
    guard(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
