import { baseTypeOrmConfig } from '../typeorm-base.config';

describe('baseTypeOrmConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DB_PASSWORD: 'test-password',
      DB_USERNAME: 'test-user',
      DB_NAME: 'test-db',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults migrationsRun to true in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DB_AUTO_RUN_MIGRATIONS;

    expect(baseTypeOrmConfig().migrationsRun).toBe(true);
  });

  it('defaults migrationsRun to false outside development', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DB_AUTO_RUN_MIGRATIONS;

    expect(baseTypeOrmConfig().migrationsRun).toBe(false);
  });

  it('respects an explicit DB_AUTO_RUN_MIGRATIONS override', () => {
    process.env.NODE_ENV = 'production';
    process.env.DB_AUTO_RUN_MIGRATIONS = 'true';

    expect(baseTypeOrmConfig().migrationsRun).toBe(true);
  });
});
