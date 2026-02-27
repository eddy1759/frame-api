import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFramesSchema1772302100000 implements MigrationInterface {
  name = 'CreateFramesSchema1772302100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "description" text,
        "icon_url" character varying(512),
        "sort_order" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "parent_id" uuid,
        "frame_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_categories_slug" UNIQUE ("slug")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "tags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(50) NOT NULL,
        "slug" character varying(50) NOT NULL,
        "usage_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tags_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tags_name" UNIQUE ("name"),
        CONSTRAINT "UQ_tags_slug" UNIQUE ("slug")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "frames" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "slug" character varying(255) NOT NULL,
        "description" text,
        "is_premium" boolean NOT NULL DEFAULT false,
        "price" numeric(10,2),
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "width" integer NOT NULL,
        "height" integer NOT NULL,
        "aspect_ratio" character varying(10) NOT NULL,
        "orientation" character varying(20) NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "view_count" integer NOT NULL DEFAULT 0,
        "apply_count" integer NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "is_ai_generated" boolean NOT NULL DEFAULT false,
        "sort_order" integer NOT NULL DEFAULT 0,
        "svg_url" character varying(512),
        "thumbnail_url" character varying(512),
        "created_by" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_frames_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_frames_slug" UNIQUE ("slug")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "frame_assets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "frame_id" uuid NOT NULL,
        "type" character varying(30) NOT NULL,
        "storage_key" character varying(512) NOT NULL,
        "mime_type" character varying(50) NOT NULL,
        "file_size" integer NOT NULL,
        "width" integer,
        "height" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_frame_assets_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "frame_categories" (
        "frame_id" uuid NOT NULL,
        "category_id" uuid NOT NULL,
        CONSTRAINT "PK_frame_categories" PRIMARY KEY ("frame_id", "category_id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "frame_tags" (
        "frame_id" uuid NOT NULL,
        "tag_id" uuid NOT NULL,
        CONSTRAINT "PK_frame_tags" PRIMARY KEY ("frame_id", "tag_id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "user_saved_frames" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "frame_id" uuid NOT NULL,
        "saved_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_saved_frames_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_saved_frame" UNIQUE ("user_id", "frame_id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_category_parent" ON "categories" ("parent_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_category_sort" ON "categories" ("sort_order", "is_active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_active_apply" ON "frames" ("is_active", "apply_count" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_active_created" ON "frames" ("is_active", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_premium" ON "frames" ("is_premium", "is_active")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_created_by" ON "frames" ("created_by")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_fts" ON "frames" USING GIN (to_tsvector('english', COALESCE("name", '') || ' ' || COALESCE("description", '')))`
    );

    await queryRunner.query(
      `CREATE INDEX "idx_asset_frame" ON "frame_assets" ("frame_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_asset_type" ON "frame_assets" ("frame_id", "type")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_frame_categories_category" ON "frame_categories" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_frame_tags_tag" ON "frame_tags" ("tag_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_saved_user" ON "user_saved_frames" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_saved_frame" ON "user_saved_frames" ("frame_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_saved_at" ON "user_saved_frames" ("saved_at" DESC)`,
    );

    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_category_parent" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "frames" ADD CONSTRAINT "FK_frames_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "frame_assets" ADD CONSTRAINT "FK_frame_assets_frame" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "frame_categories" ADD CONSTRAINT "FK_frame_categories_frame" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "frame_categories" ADD CONSTRAINT "FK_frame_categories_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "frame_tags" ADD CONSTRAINT "FK_frame_tags_frame" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "frame_tags" ADD CONSTRAINT "FK_frame_tags_tag" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_saved_frames" ADD CONSTRAINT "FK_saved_frames_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_saved_frames" ADD CONSTRAINT "FK_saved_frames_frame" FOREIGN KEY ("frame_id") REFERENCES "frames"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_saved_frames" DROP CONSTRAINT "FK_saved_frames_frame"`);
    await queryRunner.query(`ALTER TABLE "user_saved_frames" DROP CONSTRAINT "FK_saved_frames_user"`);
    await queryRunner.query(`ALTER TABLE "frame_tags" DROP CONSTRAINT "FK_frame_tags_tag"`);
    await queryRunner.query(`ALTER TABLE "frame_tags" DROP CONSTRAINT "FK_frame_tags_frame"`);
    await queryRunner.query(`ALTER TABLE "frame_categories" DROP CONSTRAINT "FK_frame_categories_category"`);
    await queryRunner.query(`ALTER TABLE "frame_categories" DROP CONSTRAINT "FK_frame_categories_frame"`);
    await queryRunner.query(`ALTER TABLE "frame_assets" DROP CONSTRAINT "FK_frame_assets_frame"`);
    await queryRunner.query(`ALTER TABLE "frames" DROP CONSTRAINT "FK_frames_created_by"`);
    await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_category_parent"`);

    await queryRunner.query(`DROP INDEX "public"."idx_saved_at"`);
    await queryRunner.query(`DROP INDEX "public"."idx_saved_frame"`);
    await queryRunner.query(`DROP INDEX "public"."idx_saved_user"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_tags_tag"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_categories_category"`);
    await queryRunner.query(`DROP INDEX "public"."idx_asset_type"`);
    await queryRunner.query(`DROP INDEX "public"."idx_asset_frame"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_fts"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_created_by"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_premium"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_active_created"`);
    await queryRunner.query(`DROP INDEX "public"."idx_frame_active_apply"`);
    await queryRunner.query(`DROP INDEX "public"."idx_category_sort"`);
    await queryRunner.query(`DROP INDEX "public"."idx_category_parent"`);

    await queryRunner.query(`DROP TABLE "user_saved_frames"`);
    await queryRunner.query(`DROP TABLE "frame_tags"`);
    await queryRunner.query(`DROP TABLE "frame_categories"`);
    await queryRunner.query(`DROP TABLE "frame_assets"`);
    await queryRunner.query(`DROP TABLE "frames"`);
    await queryRunner.query(`DROP TABLE "tags"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
