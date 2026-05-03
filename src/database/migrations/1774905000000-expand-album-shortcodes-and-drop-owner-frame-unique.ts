import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandAlbumShortcodesAndDropOwnerFrameUnique1774905000000 implements MigrationInterface {
  name = 'ExpandAlbumShortcodesAndDropOwnerFrameUnique1774905000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_album_owner_frame"
    `);
    await queryRunner.query(`
      ALTER TABLE "albums"
      ALTER COLUMN "short_code" TYPE varchar(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "albums"
      ALTER COLUMN "short_code" TYPE varchar(8)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "idx_album_owner_frame"
      ON "albums" ("owner_id", "frame_id")
    `);
  }
}
