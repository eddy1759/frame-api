import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateImageTables1773741400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "processing_status_enum" AS ENUM ('pending', 'uploaded', 'processing', 'completed', 'failed')
    `);
    await queryRunner.query(`
      CREATE TYPE "image_orientation_enum" AS ENUM ('landscape', 'portrait', 'square')
    `);
    await queryRunner.query(`
      CREATE TYPE "variant_type_enum" AS ENUM ('original', 'thumbnail', 'medium', 'large', 'panoramic_preview')
    `);
    await queryRunner.query(`
      CREATE TYPE "frame_render_status_enum" AS ENUM ('none', 'ready', 'pending_reprocess')
    `);
    await queryRunner.query(`
      CREATE TYPE "upload_session_status_enum" AS ENUM ('pending', 'completing', 'uploading', 'completed', 'failed', 'expired', 'cancelled')
    `);
    await queryRunner.query(`
      CREATE TYPE "storage_tier_enum" AS ENUM ('free', 'basic', 'pro', 'unlimited')
    `);

    await queryRunner.createTable(
      new Table({
        name: 'images',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid' },
          { name: 'frame_id', type: 'uuid', isNullable: true },
          {
            name: 'frame_snapshot_key',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          { name: 'frame_snapshot_size', type: 'bigint', isNullable: true },
          { name: 'pending_frame_id', type: 'uuid', isNullable: true },
          {
            name: 'pending_frame_snapshot_key',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          {
            name: 'pending_frame_snapshot_size',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'frame_render_status',
            type: 'frame_render_status_enum',
            default: "'none'",
          },
          { name: 'active_render_revision', type: 'int', default: 0 },
          { name: 'title', type: 'varchar', length: '255', isNullable: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'original_filename', type: 'varchar', length: '255' },
          { name: 'mime_type', type: 'varchar', length: '50' },
          { name: 'original_format', type: 'varchar', length: '10' },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '512',
            isUnique: true,
          },
          { name: 'file_size', type: 'bigint' },
          { name: 'width', type: 'int', isNullable: true },
          { name: 'height', type: 'int', isNullable: true },
          {
            name: 'aspect_ratio',
            type: 'varchar',
            length: '10',
            isNullable: true,
          },
          {
            name: 'orientation',
            type: 'image_orientation_enum',
            isNullable: true,
          },
          { name: 'is_360', type: 'boolean', default: false },
          { name: 'exif_data', type: 'jsonb', default: "'{}'::jsonb" },
          { name: 'exif_stripped', type: 'boolean', default: false },
          {
            name: 'gps_latitude',
            type: 'decimal',
            precision: 10,
            scale: 8,
            isNullable: true,
          },
          {
            name: 'gps_longitude',
            type: 'decimal',
            precision: 11,
            scale: 8,
            isNullable: true,
          },
          { name: 'checksum', type: 'varchar', length: '64', isNullable: true },
          {
            name: 'processing_status',
            type: 'processing_status_enum',
            default: "'pending'",
          },
          { name: 'processing_error', type: 'text', isNullable: true },
          {
            name: 'thumbnail_url',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          { name: 'is_public', type: 'boolean', default: false },
          { name: 'is_deleted', type: 'boolean', default: false },
          { name: 'deleted_at', type: 'timestamptz', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'image_variants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'image_id', type: 'uuid' },
          { name: 'variant_type', type: 'variant_type_enum' },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '512',
            isUnique: true,
          },
          { name: 'mime_type', type: 'varchar', length: '50' },
          { name: 'file_size', type: 'bigint' },
          { name: 'width', type: 'int' },
          { name: 'height', type: 'int' },
          { name: 'quality', type: 'int', isNullable: true },
          { name: 'cdn_url', type: 'varchar', length: '512' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'image_render_variants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'image_id', type: 'uuid' },
          { name: 'render_revision', type: 'int' },
          { name: 'variant_type', type: 'variant_type_enum' },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '512',
            isUnique: true,
          },
          { name: 'mime_type', type: 'varchar', length: '50' },
          { name: 'file_size', type: 'bigint' },
          { name: 'width', type: 'int' },
          { name: 'height', type: 'int' },
          { name: 'quality', type: 'int', isNullable: true },
          { name: 'cdn_url', type: 'varchar', length: '512' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'upload_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'user_id', type: 'uuid' },
          { name: 'frame_id', type: 'uuid', isNullable: true },
          { name: 'original_filename', type: 'varchar', length: '255' },
          { name: 'mime_type', type: 'varchar', length: '50' },
          { name: 'expected_file_size', type: 'bigint' },
          {
            name: 'storage_key',
            type: 'varchar',
            length: '512',
            isUnique: true,
          },
          { name: 'presigned_url', type: 'text' },
          {
            name: 'status',
            type: 'upload_session_status_enum',
            default: "'pending'",
          },
          { name: 'is_360', type: 'boolean', default: false },
          { name: 'expires_at', type: 'timestamptz' },
          { name: 'completed_at', type: 'timestamptz', isNullable: true },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          { name: 'error_message', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_storage_quotas',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          {
            name: 'tier_name',
            type: 'storage_tier_enum',
            default: "'free'",
          },
          { name: 'limit_bytes', type: 'bigint', default: 5368709120 },
          { name: 'used_bytes', type: 'bigint', default: 0 },
          { name: 'pending_bytes', type: 'bigint', default: 0 },
          { name: 'image_count', type: 'int', default: 0 },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_user_created',
        columnNames: ['user_id', 'created_at'],
      }),
    );
    await queryRunner.query(`
      CREATE INDEX "idx_image_user_not_deleted" ON "images" ("user_id", "is_deleted")
      WHERE "is_deleted" = false
    `);
    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_frame',
        columnNames: ['frame_id'],
      }),
    );
    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_pending_frame',
        columnNames: ['pending_frame_id'],
      }),
    );
    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_processing_status',
        columnNames: ['processing_status'],
      }),
    );
    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_storage_key',
        columnNames: ['storage_key'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'image_variants',
      new TableIndex({
        name: 'idx_variant_image',
        columnNames: ['image_id'],
      }),
    );
    await queryRunner.createIndex(
      'image_variants',
      new TableIndex({
        name: 'idx_variant_image_type',
        columnNames: ['image_id', 'variant_type'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'image_variants',
      new TableIndex({
        name: 'idx_variant_storage_key',
        columnNames: ['storage_key'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'image_render_variants',
      new TableIndex({
        name: 'idx_render_variant_image',
        columnNames: ['image_id'],
      }),
    );
    await queryRunner.createIndex(
      'image_render_variants',
      new TableIndex({
        name: 'idx_render_variant_image_revision',
        columnNames: ['image_id', 'render_revision'],
      }),
    );
    await queryRunner.createIndex(
      'image_render_variants',
      new TableIndex({
        name: 'idx_render_variant_image_revision_type',
        columnNames: ['image_id', 'render_revision', 'variant_type'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'image_render_variants',
      new TableIndex({
        name: 'idx_render_variant_storage_key',
        columnNames: ['storage_key'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'upload_sessions',
      new TableIndex({
        name: 'idx_upload_session_user',
        columnNames: ['user_id'],
      }),
    );
    await queryRunner.createIndex(
      'upload_sessions',
      new TableIndex({
        name: 'idx_upload_session_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'upload_sessions',
      new TableIndex({
        name: 'idx_upload_session_storage_key',
        columnNames: ['storage_key'],
        isUnique: true,
      }),
    );
    await queryRunner.query(`
      CREATE INDEX "idx_upload_session_expires_pending" ON "upload_sessions" ("expires_at")
      WHERE "status" = 'pending'
    `);

    await queryRunner.createForeignKeys('images', [
      new TableForeignKey({
        name: 'fk_images_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_images_frame',
        columnNames: ['frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
      new TableForeignKey({
        name: 'fk_images_pending_frame',
        columnNames: ['pending_frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createForeignKeys('image_variants', [
      new TableForeignKey({
        name: 'fk_variant_image',
        columnNames: ['image_id'],
        referencedTableName: 'images',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createForeignKeys('image_render_variants', [
      new TableForeignKey({
        name: 'fk_render_variant_image',
        columnNames: ['image_id'],
        referencedTableName: 'images',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createForeignKeys('upload_sessions', [
      new TableForeignKey({
        name: 'fk_upload_session_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_upload_session_frame',
        columnNames: ['frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createForeignKeys('user_storage_quotas', [
      new TableForeignKey({
        name: 'fk_user_storage_quota_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey(
      'user_storage_quotas',
      'fk_user_storage_quota_user',
    );
    await queryRunner.dropForeignKey(
      'upload_sessions',
      'fk_upload_session_frame',
    );
    await queryRunner.dropForeignKey(
      'upload_sessions',
      'fk_upload_session_user',
    );
    await queryRunner.dropForeignKey('image_variants', 'fk_variant_image');
    await queryRunner.dropForeignKey(
      'image_render_variants',
      'fk_render_variant_image',
    );
    await queryRunner.dropForeignKey('images', 'fk_images_pending_frame');
    await queryRunner.dropForeignKey('images', 'fk_images_frame');
    await queryRunner.dropForeignKey('images', 'fk_images_user');

    await queryRunner.dropTable('user_storage_quotas');
    await queryRunner.dropTable('upload_sessions');
    await queryRunner.dropTable('image_render_variants');
    await queryRunner.dropTable('image_variants');
    await queryRunner.dropTable('images');

    await queryRunner.query(`DROP TYPE IF EXISTS "storage_tier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "upload_session_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "frame_render_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "variant_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "image_orientation_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "processing_status_enum"`);
  }
}
