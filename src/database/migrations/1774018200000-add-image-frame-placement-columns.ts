import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddImageFramePlacementColumns1774018200000 implements MigrationInterface {
  name = 'AddImageFramePlacementColumns1774018200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('images', [
      new TableColumn({
        name: 'frame_placement',
        type: 'jsonb',
        isNullable: true,
      }),
      new TableColumn({
        name: 'pending_frame_placement',
        type: 'jsonb',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('images', 'pending_frame_placement');
    await queryRunner.dropColumn('images', 'frame_placement');
  }
}
