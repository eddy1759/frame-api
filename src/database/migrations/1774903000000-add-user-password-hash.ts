import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPasswordHash1774903000000 implements MigrationInterface {
  name = 'AddUserPasswordHash1774903000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "password_hash" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_hash"`);
  }
}
