import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillSampleFrameImagePlacement1774018300000 implements MigrationInterface {
  name = 'BackfillSampleFrameImagePlacement1774018300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "frames"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{
        "imagePlacement": {
          "version": 1,
          "fit": "cover",
          "window": {
            "x": 0.125,
            "y": 0.1111111111,
            "width": 0.75,
            "height": 0.7777777778
          }
        }
      }'::jsonb
      WHERE "slug" IN (
        'political-banner-classic',
        'graduation-ribbon-honor',
        'sports-arena-lights'
      )
    `);

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
      WHERE "slug" IN (
        'movement-neon-pulse',
        'birthday-confetti-pop',
        'abstract-gradient-flow'
      )
    `);

    await queryRunner.query(`
      UPDATE "frames"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{
        "imagePlacement": {
          "version": 1,
          "fit": "cover",
          "window": {
            "x": 0.1296296296,
            "y": 0.1354166667,
            "width": 0.7407407407,
            "height": 0.7291666667
          }
        }
      }'::jsonb
      WHERE "slug" IN (
        'wedding-floral-gold',
        'religion-minimal-light',
        'holiday-frost-sparkle',
        'nature-forest-dew'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "frames"
      SET "metadata" = "metadata" - 'imagePlacement'
      WHERE "slug" IN (
        'political-banner-classic',
        'wedding-floral-gold',
        'movement-neon-pulse',
        'religion-minimal-light',
        'birthday-confetti-pop',
        'graduation-ribbon-honor',
        'holiday-frost-sparkle',
        'sports-arena-lights',
        'nature-forest-dew',
        'abstract-gradient-flow'
      )
    `);
  }
}
