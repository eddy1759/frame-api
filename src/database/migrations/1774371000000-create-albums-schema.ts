import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAlbumsSchema1774371000000 implements MigrationInterface {
  name = 'CreateAlbumsSchema1774371000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: 'albums',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'short_code',
            type: 'varchar',
            length: '8',
            isUnique: true,
          },
          {
            name: 'frame_id',
            type: 'uuid',
          },
          {
            name: 'owner_id',
            type: 'uuid',
          },
          {
            name: 'is_public',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'album_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'album_id',
            type: 'uuid',
          },
          {
            name: 'image_id',
            type: 'uuid',
          },
          {
            name: 'frame_id',
            type: 'uuid',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'image_render_revision',
            type: 'int',
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'album_stats',
        columns: [
          {
            name: 'album_id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'view_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'share_count',
            type: 'int',
            default: 0,
          },
        ],
      }),
      true,
    );

    await queryRunner.addColumn(
      'upload_sessions',
      new TableColumn({
        name: 'album_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'images',
      new TableColumn({
        name: 'album_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'albums',
      new TableIndex({
        name: 'idx_album_shortcode',
        columnNames: ['short_code'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'albums',
      new TableIndex({
        name: 'idx_album_frame',
        columnNames: ['frame_id'],
      }),
    );
    await queryRunner.createIndex(
      'albums',
      new TableIndex({
        name: 'idx_album_owner',
        columnNames: ['owner_id'],
      }),
    );
    await queryRunner.createIndex(
      'albums',
      new TableIndex({
        name: 'idx_album_public_created',
        columnNames: ['is_public', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'albums',
      new TableIndex({
        name: 'idx_album_owner_frame',
        columnNames: ['owner_id', 'frame_id'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'album_items',
      new TableIndex({
        name: 'idx_album_item_album_image',
        columnNames: ['album_id', 'image_id'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'album_items',
      new TableIndex({
        name: 'idx_album_item_album_created',
        columnNames: ['album_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'album_items',
      new TableIndex({
        name: 'idx_album_item_image',
        columnNames: ['image_id'],
      }),
    );
    await queryRunner.createIndex(
      'album_items',
      new TableIndex({
        name: 'idx_album_item_user',
        columnNames: ['user_id'],
      }),
    );
    await queryRunner.createIndex(
      'album_items',
      new TableIndex({
        name: 'idx_album_item_frame',
        columnNames: ['frame_id'],
      }),
    );

    await queryRunner.createIndex(
      'upload_sessions',
      new TableIndex({
        name: 'idx_upload_session_album',
        columnNames: ['album_id'],
      }),
    );
    await queryRunner.createIndex(
      'images',
      new TableIndex({
        name: 'idx_image_album',
        columnNames: ['album_id'],
      }),
    );

    await queryRunner.createForeignKeys('albums', [
      new TableForeignKey({
        name: 'fk_albums_frame',
        columnNames: ['frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
      }),
      new TableForeignKey({
        name: 'fk_albums_owner',
        columnNames: ['owner_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createForeignKeys('album_items', [
      new TableForeignKey({
        name: 'fk_album_items_album',
        columnNames: ['album_id'],
        referencedTableName: 'albums',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_album_items_image',
        columnNames: ['image_id'],
        referencedTableName: 'images',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createForeignKey(
      'album_stats',
      new TableForeignKey({
        name: 'fk_album_stats_album',
        columnNames: ['album_id'],
        referencedTableName: 'albums',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'upload_sessions',
      new TableForeignKey({
        name: 'fk_upload_session_album',
        columnNames: ['album_id'],
        referencedTableName: 'albums',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'images',
      new TableForeignKey({
        name: 'fk_images_album',
        columnNames: ['album_id'],
        referencedTableName: 'albums',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('images', 'fk_images_album');
    await queryRunner.dropForeignKey(
      'upload_sessions',
      'fk_upload_session_album',
    );
    await queryRunner.dropForeignKey('album_stats', 'fk_album_stats_album');
    await queryRunner.dropForeignKey('album_items', 'fk_album_items_image');
    await queryRunner.dropForeignKey('album_items', 'fk_album_items_album');
    await queryRunner.dropForeignKey('albums', 'fk_albums_owner');
    await queryRunner.dropForeignKey('albums', 'fk_albums_frame');

    await queryRunner.dropIndex('images', 'idx_image_album');
    await queryRunner.dropIndex('upload_sessions', 'idx_upload_session_album');
    await queryRunner.dropIndex('album_items', 'idx_album_item_frame');
    await queryRunner.dropIndex('album_items', 'idx_album_item_user');
    await queryRunner.dropIndex('album_items', 'idx_album_item_image');
    await queryRunner.dropIndex('album_items', 'idx_album_item_album_created');
    await queryRunner.dropIndex('album_items', 'idx_album_item_album_image');
    await queryRunner.dropIndex('albums', 'idx_album_owner_frame');
    await queryRunner.dropIndex('albums', 'idx_album_public_created');
    await queryRunner.dropIndex('albums', 'idx_album_owner');
    await queryRunner.dropIndex('albums', 'idx_album_frame');
    await queryRunner.dropIndex('albums', 'idx_album_shortcode');

    await queryRunner.dropColumn('images', 'album_id');
    await queryRunner.dropColumn('upload_sessions', 'album_id');

    await queryRunner.dropTable('album_stats');
    await queryRunner.dropTable('album_items');
    await queryRunner.dropTable('albums');
  }
}
