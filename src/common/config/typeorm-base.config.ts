import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const resolveAutoRunMigrations = (): boolean => {
  const configured = process.env.DB_AUTO_RUN_MIGRATIONS?.trim();
  if (configured) {
    return configured.toLowerCase() === 'true';
  }

  return (process.env.NODE_ENV ?? 'development') === 'development';
};

export const baseTypeOrmConfig = (): TypeOrmModuleOptions => {
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD must be a non-empty string in .env');
  }

  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../../database/migrations/*{.ts,.js}'],
    migrationsRun: resolveAutoRunMigrations(),
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
  };
};
