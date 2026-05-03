import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRole1772302000000 implements MigrationInterface {
  name = 'AddUserRole1772302000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "role" character varying(20) NOT NULL DEFAULT 'user'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_users_role" ON "users" ("role")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_users_role"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
  }
}
