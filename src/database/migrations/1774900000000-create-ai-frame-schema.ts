import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateAiFrameSchema1774900000000 implements MigrationInterface {
  name = 'CreateAiFrameSchema1774900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.createTable(
      new Table({
        name: 'ai_frame_jobs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '30',
          },
          {
            name: 'prompt',
            type: 'text',
          },
          {
            name: 'aspect_ratio',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'latest_iteration_number',
            type: 'int',
            default: 0,
          },
          {
            name: 'accepted_iteration_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'promoted_frame_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'cancel_requested_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'last_error_code',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'last_error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'accepted_at',
            type: 'timestamptz',
            isNullable: true,
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
          {
            name: 'deleted_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'ai_frame_iterations',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'job_id',
            type: 'uuid',
          },
          {
            name: 'iteration_number',
            type: 'int',
          },
          {
            name: 'status',
            type: 'varchar',
            length: '30',
          },
          {
            name: 'feedback',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'engineered_prompt',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'model_version',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'generation_ms',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'raw_image_storage_key',
            type: 'varchar',
            length: '512',
            isNullable: true,
          },
          {
            name: 'raw_image_mime_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'raw_image_size',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'frame_id',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'queue_job_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'error_code',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'started_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'completed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'failed_at',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'cleaned_at',
            type: 'timestamptz',
            isNullable: true,
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

    await queryRunner.addColumn(
      'frames',
      new TableColumn({
        name: 'generated_by_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'ai_frame_jobs',
      new TableIndex({
        name: 'idx_ai_frame_jobs_user_created',
        columnNames: ['user_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'ai_frame_jobs',
      new TableIndex({
        name: 'idx_ai_frame_jobs_status_created',
        columnNames: ['status', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'ai_frame_iterations',
      new TableIndex({
        name: 'idx_ai_frame_iterations_job_created',
        columnNames: ['job_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'ai_frame_iterations',
      new TableIndex({
        name: 'idx_ai_frame_iterations_status_created',
        columnNames: ['status', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'ai_frame_iterations',
      new TableIndex({
        name: 'idx_ai_frame_iterations_frame',
        columnNames: ['frame_id'],
      }),
    );
    await queryRunner.createIndex(
      'ai_frame_iterations',
      new TableIndex({
        name: 'idx_ai_frame_iterations_job_number',
        columnNames: ['job_id', 'iteration_number'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'frames',
      new TableIndex({
        name: 'idx_frame_generated_by_created',
        columnNames: ['generated_by_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'frames',
      new TableIndex({
        name: 'idx_frame_ai_generated_private',
        columnNames: ['is_ai_generated', 'generated_by_id', 'is_active'],
      }),
    );

    await queryRunner.createForeignKeys('ai_frame_jobs', [
      new TableForeignKey({
        name: 'fk_ai_frame_jobs_user',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_ai_frame_jobs_promoted_frame',
        columnNames: ['promoted_frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createForeignKeys('ai_frame_iterations', [
      new TableForeignKey({
        name: 'fk_ai_frame_iterations_job',
        columnNames: ['job_id'],
        referencedTableName: 'ai_frame_jobs',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        name: 'fk_ai_frame_iterations_frame',
        columnNames: ['frame_id'],
        referencedTableName: 'frames',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    ]);

    await queryRunner.createForeignKey(
      'ai_frame_jobs',
      new TableForeignKey({
        name: 'fk_ai_frame_jobs_accepted_iteration',
        columnNames: ['accepted_iteration_id'],
        referencedTableName: 'ai_frame_iterations',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'frames',
      new TableForeignKey({
        name: 'fk_frames_generated_by',
        columnNames: ['generated_by_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('frames', 'fk_frames_generated_by');
    await queryRunner.dropForeignKey(
      'ai_frame_jobs',
      'fk_ai_frame_jobs_accepted_iteration',
    );
    await queryRunner.dropForeignKey(
      'ai_frame_iterations',
      'fk_ai_frame_iterations_frame',
    );
    await queryRunner.dropForeignKey(
      'ai_frame_iterations',
      'fk_ai_frame_iterations_job',
    );
    await queryRunner.dropForeignKey(
      'ai_frame_jobs',
      'fk_ai_frame_jobs_promoted_frame',
    );
    await queryRunner.dropForeignKey('ai_frame_jobs', 'fk_ai_frame_jobs_user');

    await queryRunner.dropIndex('frames', 'idx_frame_ai_generated_private');
    await queryRunner.dropIndex('frames', 'idx_frame_generated_by_created');
    await queryRunner.dropIndex(
      'ai_frame_iterations',
      'idx_ai_frame_iterations_job_number',
    );
    await queryRunner.dropIndex(
      'ai_frame_iterations',
      'idx_ai_frame_iterations_frame',
    );
    await queryRunner.dropIndex(
      'ai_frame_iterations',
      'idx_ai_frame_iterations_status_created',
    );
    await queryRunner.dropIndex(
      'ai_frame_iterations',
      'idx_ai_frame_iterations_job_created',
    );
    await queryRunner.dropIndex(
      'ai_frame_jobs',
      'idx_ai_frame_jobs_status_created',
    );
    await queryRunner.dropIndex(
      'ai_frame_jobs',
      'idx_ai_frame_jobs_user_created',
    );

    await queryRunner.dropColumn('frames', 'generated_by_id');
    await queryRunner.dropTable('ai_frame_iterations');
    await queryRunner.dropTable('ai_frame_jobs');
  }
}
