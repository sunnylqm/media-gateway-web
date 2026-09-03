import { describe, expect, it } from 'bun:test';
import { currentAdminUserPath } from './adminUserPath';

describe('currentAdminUserPath', () => {
  it('refuses to target a stale user after the route changes', () => {
    expect(currentAdminUserPath('user-a', 'user-b', '/credits')).toBeNull();
  });

  it('targets the displayed user only when it matches the route', () => {
    expect(currentAdminUserPath('user/a', 'user/a', '/credits')).toBe(
      '/v1/admin/users/user%2Fa/credits',
    );
  });
});
