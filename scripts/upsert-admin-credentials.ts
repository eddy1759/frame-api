/* eslint-disable no-console */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { User } from '../src/auth/entities/user.entity';
import { OAuthAccount } from '../src/auth/entities/oauth-account.entity';
import { RefreshToken } from '../src/auth/entities/refresh-token.entity';
import { UserRole } from '../src/auth/enums/user-role.enum';
import { UserStatus } from '../src/auth/enums/user-status.enum';
import {
  assertPasswordCanBeStored,
  hashPassword,
} from '../src/auth/utils/password.util';

dotenv.config();

async function run(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_DISPLAY_NAME?.trim() || 'Admin';

  if (!email) {
    throw new Error('ADMIN_EMAIL is required.');
  }

  if (!password) {
    throw new Error('ADMIN_PASSWORD is required.');
  }

  assertPasswordCanBeStored(password);

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: false,
    logging: false,
    entities: [User, OAuthAccount, RefreshToken],
  });

  await dataSource.initialize();

  try {
    const userRepository = dataSource.getRepository(User);
    const passwordHash = await hashPassword(password);
    const existing = await userRepository.findOne({
      where: { email },
      withDeleted: true,
    });

    if (existing) {
      await userRepository
        .createQueryBuilder()
        .update(User)
        .set({
          displayName: existing.displayName ?? displayName,
          passwordHash,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        })
        .where('id = :id', { id: existing.id })
        .execute();

      console.log(`Updated admin credentials for ${email} (${existing.id}).`);
      return;
    }

    const user = userRepository.create({
      email,
      displayName,
      passwordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });

    const savedUser = await userRepository.save(user);
    console.log(`Created admin user ${email} (${savedUser.id}).`);
  } finally {
    await dataSource.destroy();
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Admin credential upsert failed: ${message}`);
  process.exit(1);
});
