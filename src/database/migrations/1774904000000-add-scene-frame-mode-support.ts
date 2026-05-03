import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSceneFrameModeSupport1774904000000 implements MigrationInterface {
  name = 'AddSceneFrameModeSupport1774904000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'ai_frame_jobs',
      new TableColumn({
        name: 'generation_mode',
        type: 'varchar',
        length: '20',
        default: "'overlay'",
      }),
    );

    await queryRunner.addColumn(
      'images',
      new TableColumn({
        name: 'frame_snapshot_asset_type',
        type: 'varchar',
        length: '30',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'images',
      new TableColumn({
        name: 'pending_frame_snapshot_asset_type',
        type: 'varchar',
        length: '30',
        isNullable: true,
      }),
    );

    await queryRunner.query(`
      UPDATE ai_frame_jobs
      SET generation_mode = 'overlay'
      WHERE generation_mode IS NULL
    `);

    await queryRunner.query(`
      UPDATE images
      SET frame_snapshot_asset_type = CASE
        WHEN frame_snapshot_key ILIKE '%.png' THEN 'scene_base_png'
        WHEN frame_snapshot_key IS NOT NULL THEN 'svg'
        ELSE NULL
      END
      WHERE frame_snapshot_asset_type IS NULL
    `);

    await queryRunner.query(`
      UPDATE images
      SET pending_frame_snapshot_asset_type = CASE
        WHEN pending_frame_snapshot_key ILIKE '%.png' THEN 'scene_base_png'
        WHEN pending_frame_snapshot_key IS NOT NULL THEN 'svg'
        ELSE NULL
      END
      WHERE pending_frame_snapshot_asset_type IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE ai_frame_jobs
      ALTER COLUMN generation_mode SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('images', 'pending_frame_snapshot_asset_type');
    await queryRunner.dropColumn('images', 'frame_snapshot_asset_type');
    await queryRunner.dropColumn('ai_frame_jobs', 'generation_mode');
  }
}
