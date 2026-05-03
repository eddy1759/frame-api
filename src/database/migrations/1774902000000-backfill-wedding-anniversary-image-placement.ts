import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillWeddingAnniversaryImagePlacement1774902000000 implements MigrationInterface {
  name = 'BackfillWeddingAnniversaryImagePlacement1774902000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "frames"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{
        "imagePlacement": {
          "version": 1,
          "fit": "cover",
          "window": {
            "x": 0.1296296296,
            "y": 0.1296296296,
            "width": 0.7407407407,
            "height": 0.7407407407
          }
        }
      }'::jsonb
      WHERE "slug" = 'wedding-anniversary'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "frames"
      SET "metadata" = "metadata" - 'imagePlacement'
      WHERE "slug" = 'wedding-anniversary'
    `);
  }
}
