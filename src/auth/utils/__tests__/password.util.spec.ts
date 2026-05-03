import {
  assertPasswordCanBeStored,
  hashPassword,
  verifyPassword,
} from '../password.util';

describe('password.util', () => {
  it('hashes and verifies a password round-trip', async () => {
    const password = 'CorrectHorseBatteryStaple!';

    const hash = await hashPassword(password);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('rejects malformed password hashes safely', async () => {
    await expect(
      verifyPassword('CorrectHorseBatteryStaple!', 'not-a-real-hash'),
    ).resolves.toBe(false);
  });

  it('enforces minimum password quality for stored admin credentials', () => {
    expect(() => assertPasswordCanBeStored('short')).toThrow(
      'Password must be at least 12 characters long.',
    );
    expect(() => assertPasswordCanBeStored('            ')).toThrow(
      'Password must not be empty.',
    );
  });
});
