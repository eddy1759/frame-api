import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddUserSubscriptionActive1773741500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'subscription_active',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'subscription_active');
  }
}
