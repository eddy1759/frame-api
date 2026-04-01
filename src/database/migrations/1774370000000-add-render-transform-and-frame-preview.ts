import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRenderTransformAndFramePreview1774370000000 implements MigrationInterface {
  name = 'AddRenderTransformAndFramePreview1774370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('images', [
      new TableColumn({
        name: 'render_transform',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'pending_render_transform',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);

    await queryRunner.addColumn(
      'frames',
      new TableColumn({
        name: 'editor_preview_url',
        type: 'varchar',
        length: '512',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('frames', 'editor_preview_url');
    await queryRunner.dropColumn('images', 'pending_render_transform');
    await queryRunner.dropColumn('images', 'render_transform');
  }
}
