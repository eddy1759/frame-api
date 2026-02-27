import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSampleFrames1772302300000 implements MigrationInterface {
  name = 'SeedSampleFrames1772302300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "frames" (
        "name",
        "slug",
        "description",
        "is_premium",
        "price",
        "currency",
        "width",
        "height",
        "aspect_ratio",
        "orientation",
        "metadata",
        "is_active",
        "is_ai_generated",
        "sort_order"
      )
      VALUES
        ('Political Banner Classic', 'political-banner-classic', 'Bold campaign-themed border frame.', false, null, 'USD', 1920, 1080, '16:9', 'landscape', '{"style":"bold","palette":["red","blue","white"]}', true, false, 1),
        ('Wedding Floral Gold', 'wedding-floral-gold', 'Elegant floral wedding frame with gold accents.', true, 2.99, 'USD', 1080, 1920, '9:16', 'portrait', '{"style":"floral","palette":["gold","ivory","green"]}', true, false, 2),
        ('Movement Neon Pulse', 'movement-neon-pulse', 'High-energy movement frame with neon accents.', false, null, 'USD', 1080, 1080, '1:1', 'square', '{"style":"neon","palette":["cyan","magenta","black"]}', true, false, 3),
        ('Religion Minimal Light', 'religion-minimal-light', 'Minimal sacred-themed frame with light gradients.', false, null, 'USD', 1080, 1920, '9:16', 'portrait', '{"style":"minimal","palette":["white","gold"]}', true, false, 4),
        ('Birthday Confetti Pop', 'birthday-confetti-pop', 'Playful confetti birthday frame.', false, null, 'USD', 1080, 1080, '1:1', 'square', '{"style":"playful","palette":["yellow","pink","blue"]}', true, false, 5),
        ('Graduation Ribbon Honor', 'graduation-ribbon-honor', 'Graduation frame with ribbon and crest details.', false, null, 'USD', 1920, 1080, '16:9', 'landscape', '{"style":"classic","palette":["navy","gold"]}', true, false, 6),
        ('Holiday Frost Sparkle', 'holiday-frost-sparkle', 'Holiday frame with frosted sparkle edges.', true, 1.99, 'USD', 1080, 1920, '9:16', 'portrait', '{"style":"seasonal","palette":["teal","silver","white"]}', true, false, 7),
        ('Sports Arena Lights', 'sports-arena-lights', 'Dynamic sports frame with stadium lights.', false, null, 'USD', 1920, 1080, '16:9', 'landscape', '{"style":"dynamic","palette":["orange","black","white"]}', true, false, 8),
        ('Nature Forest Dew', 'nature-forest-dew', 'Natural green frame inspired by forest dew.', false, null, 'USD', 1080, 1920, '9:16', 'portrait', '{"style":"organic","palette":["green","brown","cream"]}', true, false, 9),
        ('Abstract Gradient Flow', 'abstract-gradient-flow', 'Modern abstract frame with smooth gradients.', true, 3.49, 'USD', 1080, 1080, '1:1', 'square', '{"style":"abstract","palette":["purple","orange","teal"]}', true, false, 10)
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "tags" ("name", "slug")
      VALUES
        ('bold', 'bold'),
        ('floral', 'floral'),
        ('premium', 'premium'),
        ('neon', 'neon'),
        ('minimal', 'minimal'),
        ('celebration', 'celebration'),
        ('seasonal', 'seasonal'),
        ('sports', 'sports'),
        ('nature', 'nature'),
        ('abstract', 'abstract')
      ON CONFLICT ("name") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "frame_categories" ("frame_id", "category_id")
      SELECT f."id", c."id"
      FROM (
        VALUES
          ('political-banner-classic', 'political'),
          ('wedding-floral-gold', 'wedding'),
          ('movement-neon-pulse', 'movement'),
          ('religion-minimal-light', 'religion'),
          ('birthday-confetti-pop', 'birthday'),
          ('graduation-ribbon-honor', 'graduation'),
          ('holiday-frost-sparkle', 'holiday'),
          ('sports-arena-lights', 'sports'),
          ('nature-forest-dew', 'nature'),
          ('abstract-gradient-flow', 'abstract')
      ) AS mapping("frame_slug", "category_slug")
      INNER JOIN "frames" f ON f."slug" = mapping."frame_slug"
      INNER JOIN "categories" c ON c."slug" = mapping."category_slug"
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "frame_tags" ("frame_id", "tag_id")
      SELECT f."id", t."id"
      FROM (
        VALUES
          ('political-banner-classic', 'bold'),
          ('wedding-floral-gold', 'floral'),
          ('wedding-floral-gold', 'premium'),
          ('movement-neon-pulse', 'neon'),
          ('religion-minimal-light', 'minimal'),
          ('birthday-confetti-pop', 'celebration'),
          ('graduation-ribbon-honor', 'celebration'),
          ('holiday-frost-sparkle', 'seasonal'),
          ('holiday-frost-sparkle', 'premium'),
          ('sports-arena-lights', 'sports'),
          ('nature-forest-dew', 'nature'),
          ('abstract-gradient-flow', 'abstract'),
          ('abstract-gradient-flow', 'premium')
      ) AS mapping("frame_slug", "tag_name")
      INNER JOIN "frames" f ON f."slug" = mapping."frame_slug"
      INNER JOIN "tags" t ON t."name" = mapping."tag_name"
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "categories" c
      SET "frame_count" = counts."count"
      FROM (
        SELECT c2."id", COUNT(f."id")::int AS "count"
        FROM "categories" c2
        LEFT JOIN "frame_categories" fc ON fc."category_id" = c2."id"
        LEFT JOIN "frames" f ON f."id" = fc."frame_id" AND f."is_active" = true
        GROUP BY c2."id"
      ) counts
      WHERE c."id" = counts."id"
    `);

    await queryRunner.query(`
      UPDATE "tags" t
      SET "usage_count" = counts."count"
      FROM (
        SELECT t2."id", COUNT(f."id")::int AS "count"
        FROM "tags" t2
        LEFT JOIN "frame_tags" ft ON ft."tag_id" = t2."id"
        LEFT JOIN "frames" f ON f."id" = ft."frame_id" AND f."is_active" = true
        GROUP BY t2."id"
      ) counts
      WHERE t."id" = counts."id"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "frames"
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

    await queryRunner.query(`
      DELETE FROM "tags"
      WHERE "name" IN (
        'bold',
        'floral',
        'premium',
        'neon',
        'minimal',
        'celebration',
        'seasonal',
        'sports',
        'nature',
        'abstract'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "frame_tags" ft WHERE ft."tag_id" = "tags"."id"
      )
    `);

    await queryRunner.query(`
      UPDATE "categories" c
      SET "frame_count" = counts."count"
      FROM (
        SELECT c2."id", COUNT(f."id")::int AS "count"
        FROM "categories" c2
        LEFT JOIN "frame_categories" fc ON fc."category_id" = c2."id"
        LEFT JOIN "frames" f ON f."id" = fc."frame_id" AND f."is_active" = true
        GROUP BY c2."id"
      ) counts
      WHERE c."id" = counts."id"
    `);

    await queryRunner.query(`
      UPDATE "tags" t
      SET "usage_count" = counts."count"
      FROM (
        SELECT t2."id", COUNT(f."id")::int AS "count"
        FROM "tags" t2
        LEFT JOIN "frame_tags" ft ON ft."tag_id" = t2."id"
        LEFT JOIN "frames" f ON f."id" = ft."frame_id" AND f."is_active" = true
        GROUP BY t2."id"
      ) counts
      WHERE t."id" = counts."id"
    `);
  }
}
