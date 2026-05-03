import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeImageFrameRenderStatus1774901000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "frame_render_status_enum" RENAME TO "frame_render_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "frame_render_status_enum" AS ENUM ('none', 'ready', 'pending_reprocess', 'processing')`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ALTER COLUMN "frame_render_status" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "images"
      ALTER COLUMN "frame_render_status"
      TYPE "frame_render_status_enum"
      USING ("frame_render_status"::text)::"frame_render_status_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "images" ALTER COLUMN "frame_render_status" SET DEFAULT 'none'`,
    );
    await queryRunner.query(`DROP TYPE "frame_render_status_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "frame_render_status_enum" RENAME TO "frame_render_status_enum_new"`,
    );
    await queryRunner.query(
      `CREATE TYPE "frame_render_status_enum" AS ENUM ('none', 'ready', 'pending_reprocess')`,
    );
    await queryRunner.query(
      `ALTER TABLE "images" ALTER COLUMN "frame_render_status" DROP DEFAULT`,
    );
    await queryRunner.query(`
      ALTER TABLE "images"
      ALTER COLUMN "frame_render_status"
      TYPE "frame_render_status_enum"
      USING (
        CASE "frame_render_status"::text
          WHEN 'processing' THEN 'pending_reprocess'
          ELSE "frame_render_status"::text
        END
      )::"frame_render_status_enum"
    `);
    await queryRunner.query(
      `ALTER TABLE "images" ALTER COLUMN "frame_render_status" SET DEFAULT 'none'`,
    );
    await queryRunner.query(`DROP TYPE "frame_render_status_enum_new"`);
  }
}
