import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedDefaultFrameCategories1772302200000 implements MigrationInterface {
  name = 'SeedDefaultFrameCategories1772302200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "categories" ("name", "slug", "sort_order", "is_active")
      VALUES
        ('Political', 'political', 1, true),
        ('Wedding', 'wedding', 2, true),
        ('Movement', 'movement', 3, true),
        ('Religion', 'religion', 4, true),
        ('Birthday', 'birthday', 5, true),
        ('Graduation', 'graduation', 6, true),
        ('Holiday', 'holiday', 7, true),
        ('Sports', 'sports', 8, true),
        ('Nature', 'nature', 9, true),
        ('Abstract', 'abstract', 10, true)
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "categories"
      WHERE "slug" IN (
        'political',
        'wedding',
        'movement',
        'religion',
        'birthday',
        'graduation',
        'holiday',
        'sports',
        'nature',
        'abstract'
      )
    `);
  }
}
