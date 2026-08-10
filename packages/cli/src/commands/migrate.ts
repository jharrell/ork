import { findSchemaFile } from '@ork-orm/config'
import type { AnyKyselyDatabase } from '@ork-orm/migrate'
import type { Kysely } from 'kysely'
import prompts from 'prompts'

import type { CommandResult, MigrateOptions } from '../types.js'
import { BaseCommand } from '../utils/command.js'
import { cliCreateKyselyFromConfig } from '../utils/config-error-handler.js'
import { logger } from '../utils/logger.js'

/** Cast Kysely instance to AnyKyselyDatabase for migrate API compatibility */
function toMigrateDb(kysely: Kysely<unknown>): AnyKyselyDatabase {
  return kysely as unknown as AnyKyselyDatabase
}

/**
 * Migration command that integrates with Kysely instances and migration engine
 */
export class MigrateCommand extends BaseCommand {
  async execute(options: MigrateOptions = {}): Promise<CommandResult> {
    try {
      logger.info('Loading migration engine...')

      // Create Kysely instance from configuration using enhanced error handling
      const { kysely: kyselyInstance, config, configDir } = await cliCreateKyselyFromConfig()

      // Find schema file
      const schemaPath = findSchemaFile(config, configDir)

      // Import migration engine
      const { OrkMigrate } = await import('@ork-orm/migrate')
      const migrate = new OrkMigrate({
        useTransaction: true,
        validateSchema: true,
        timeout: 30000,
        logging: {
          level: 'info',
          logStatements: true,
          logExecutionTimes: true,
          logProgress: true,
        },
      })

      logger.info('Generating migration preview...')

      // Generate migration diff for SQL preview
      const migrationDiff = await migrate.diff(toMigrateDb(kyselyInstance), schemaPath)

      if (migrationDiff.statements.length === 0) {
        logger.success('No migration changes detected. Database is up to date!')
        await kyselyInstance.destroy()
        return {
          success: true,
          message: 'No migration changes needed',
        }
      }

      // Display migration preview
      this.displayMigrationPreview(migrationDiff)

      // Get user confirmation unless --yes flag is provided
      if (!options.yes) {
        const confirmed = await this.promptForConfirmation(migrationDiff)
        if (!confirmed) {
          logger.info('Migration cancelled by user')
          await kyselyInstance.destroy()
          return {
            success: false,
            message: 'Migration cancelled by user',
          }
        }
      }

      logger.info('Applying migration...')

      // Apply migration with progress reporting
      const result = await migrate.applyWithConfirmation(toMigrateDb(kyselyInstance), schemaPath, {
        enabled: false, // We already handled confirmation above
        minimumRiskLevel: 'low',
        showDetailedSummary: false,
        requireExplicitConfirmation: false,
      })

      // Clean up Kysely connection
      await kyselyInstance.destroy()

      if (result.success) {
        logger.success(
          `Migration completed successfully! (${result.statementsExecuted} statements executed in ${result.executionTime}ms)`,
        )
        return {
          success: true,
          message: 'Migration applied successfully',
        }
      } else {
        const errorMessages = result.errors.map((e) => e.message).join(', ')
        logger.error(`Migration failed: ${errorMessages}`)
        return {
          success: false,
          message: `Migration failed: ${errorMessages}`,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Migration command failed: ${errorMessage}`)

      if (process.env.DEBUG) {
        console.error(error)
      }

      return {
        success: false,
        message: `Migration failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  private displayMigrationPreview(migrationDiff: any) {
    logger.info('\n📋 Migration Preview:')

    // Display summary
    const { summary } = migrationDiff
    if (summary.tablesCreated.length > 0) {
      logger.info(`  ✅ Tables to create: ${summary.tablesCreated.join(', ')}`)
    }
    if (summary.tablesModified.length > 0) {
      logger.info(`  🔄 Tables to modify: ${summary.tablesModified.join(', ')}`)
    }
    if (summary.tablesDropped.length > 0) {
      logger.warn(`  ❌ Tables to drop: ${summary.tablesDropped.join(', ')}`)
    }
    if (summary.columnsAdded.length > 0) {
      logger.info(`  ➕ Columns to add: ${summary.columnsAdded.length}`)
    }
    if (summary.columnsModified.length > 0) {
      logger.info(`  🔄 Columns to modify: ${summary.columnsModified.length}`)
    }
    if (summary.columnsDropped.length > 0) {
      logger.warn(`  ➖ Columns to drop: ${summary.columnsDropped.length}`)
    }

    // Display risk assessment
    const { impact } = migrationDiff
    logger.info(`\n⚠️  Risk Level: ${impact.riskLevel.toUpperCase()}`)
    logger.info(`⏱️  Estimated Duration: ${impact.estimatedDuration}`)

    if (impact.warnings.length > 0) {
      logger.warn('\n⚠️  Warnings:')
      impact.warnings.forEach((warning: string) => {
        logger.warn(`  • ${warning}`)
      })
    }

    // Display SQL statements
    if (migrationDiff.statements.length > 0) {
      logger.info('\n📝 SQL Statements to execute:')
      migrationDiff.statements.forEach((statement: string, index: number) => {
        logger.info(`  ${index + 1}. ${statement}`)
      })
    }

    console.log() // Add spacing
  }

  private async promptForConfirmation(migrationDiff: any): Promise<boolean> {
    const hasDestructiveChanges = migrationDiff.hasDestructiveChanges
    const riskLevel = migrationDiff.impact.riskLevel

    const message = hasDestructiveChanges
      ? '⚠️  This migration contains destructive changes that may cause data loss. Do you want to continue?'
      : riskLevel === 'high'
      ? '⚠️  This is a high-risk migration. Do you want to continue?'
      : 'Do you want to apply this migration?'

    const response = await prompts(
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        initial: false,
      },
      {
        onCancel: () => {
          logger.info('Migration cancelled')
          process.exit(0)
        },
      },
    )

    return response.confirmed
  }
}

/**
 * Register migrate command with subcommands
 */
export function registerMigrateCommand(program: any) {
  const migrateCmd = program.command('migrate').description('Database migration commands')

  // migrate dev - Main development migration command
  migrateCmd
    .command('dev')
    .description('Apply pending migrations to development database')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--dry-run', 'Show what would be migrated without applying changes')
    .action(async (options: MigrateOptions) => {
      const command = new MigrateCommand()
      await command.run(options)
    })

  // migrate status - Show migration status
  migrateCmd
    .command('status')
    .description('Show current migration status')
    .action(async () => {
      const command = new MigrateStatusCommand()
      await command.run()
    })

  // migrate history - Show migration history
  migrateCmd
    .command('history')
    .description('Show migration history')
    .option('--limit <number>', 'Limit number of entries to show', '10')
    .action(async (options: { limit: string }) => {
      const command = new MigrateHistoryCommand()
      await command.run({ limit: parseInt(options.limit) })
    })

  // migrate rollback - Rollback last migration
  migrateCmd
    .command('rollback')
    .description('Rollback the last applied migration')
    .option('-y, --yes', 'Skip confirmation prompts')
    .action(async (options: MigrateOptions) => {
      const command = new MigrateRollbackCommand()
      await command.run(options)
    })
}

/**
 * Migration status command
 */
class MigrateStatusCommand extends BaseCommand {
  async execute(): Promise<CommandResult> {
    try {
      // Create Kysely instance from configuration using enhanced error handling
      const { kysely: kyselyInstance, config, configDir } = await cliCreateKyselyFromConfig()

      // Find schema file
      const schemaPath = findSchemaFile(config, configDir)

      // Import migration engine
      const { OrkMigrate } = await import('@ork-orm/migrate')
      const migrate = new OrkMigrate()

      // Check if schema is up to date
      const isValid = await migrate.validate(toMigrateDb(kyselyInstance), schemaPath)

      if (isValid) {
        logger.success('✅ Database is up to date with schema')
      } else {
        logger.warn('⚠️  Database is out of sync with schema')

        // Show what changes are pending
        const diff = await migrate.diff(toMigrateDb(kyselyInstance), schemaPath)
        if (diff.statements.length > 0) {
          logger.info(`📋 ${diff.statements.length} pending migration(s)`)
          logger.info('Run `ork migrate dev` to apply changes')
        }
      }

      await kyselyInstance.destroy()

      return {
        success: true,
        message: isValid ? 'Database is up to date' : 'Database needs migration',
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Status check failed: ${errorMessage}`)

      return {
        success: false,
        message: `Status check failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}

/**
 * Migration history command
 */
class MigrateHistoryCommand extends BaseCommand {
  async execute(options: { limit: number } = { limit: 10 }): Promise<CommandResult> {
    try {
      // Create Kysely instance from configuration using enhanced error handling
      const { kysely: kyselyInstance } = await cliCreateKyselyFromConfig()

      // Import migration engine
      const { OrkMigrate } = await import('@ork-orm/migrate')
      const migrate = new OrkMigrate()

      // Get migration history
      const history = await migrate.getHistory(toMigrateDb(kyselyInstance))

      if (history.length === 0) {
        logger.info('No migrations have been applied yet')
      } else {
        logger.info(`\n📚 Migration History (showing last ${Math.min(options.limit, history.length)} entries):\n`)

        const limitedHistory = history.slice(0, options.limit)

        limitedHistory.forEach((entry, index) => {
          const status = entry.success ? '✅' : '❌'
          const date = entry.appliedAt.toLocaleString()
          const duration = `${entry.executionTime}ms`

          logger.info(`${status} ${entry.name}`)
          logger.info(`   ID: ${entry.id}`)
          logger.info(`   Applied: ${date}`)
          logger.info(`   Duration: ${duration}`)
          logger.info(`   Checksum: ${entry.checksum}`)

          if (index < limitedHistory.length - 1) {
            console.log()
          }
        })
      }

      await kyselyInstance.destroy()

      return {
        success: true,
        message: `Showed ${Math.min(options.limit, history.length)} migration entries`,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`History command failed: ${errorMessage}`)

      return {
        success: false,
        message: `History command failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}

/**
 * Migration rollback command
 */
class MigrateRollbackCommand extends BaseCommand {
  async execute(options: MigrateOptions = {}): Promise<CommandResult> {
    try {
      // Create Kysely instance from configuration using enhanced error handling
      const { kysely: kyselyInstance } = await cliCreateKyselyFromConfig()

      // Import migration engine
      const { OrkMigrate } = await import('@ork-orm/migrate')
      const migrate = new OrkMigrate()

      // Get latest migration
      const history = await migrate.getHistory(toMigrateDb(kyselyInstance))

      if (history.length === 0) {
        logger.info('No migrations to rollback')
        await kyselyInstance.destroy()
        return {
          success: true,
          message: 'No migrations to rollback',
        }
      }

      const latestMigration = history[0]

      if (!latestMigration.success) {
        logger.error('Cannot rollback failed migration')
        await kyselyInstance.destroy()
        return {
          success: false,
          message: 'Cannot rollback failed migration',
        }
      }

      logger.info(`\n🔄 Preparing to rollback migration: ${latestMigration.name}`)
      logger.info(`   ID: ${latestMigration.id}`)
      logger.info(`   Applied: ${latestMigration.appliedAt.toLocaleString()}`)

      // Generate rollback preview
      const rollbackInfo = await migrate.generateRollback(toMigrateDb(kyselyInstance), latestMigration.id)

      if (!rollbackInfo.canRollback) {
        logger.error('❌ This migration cannot be rolled back automatically')
        if (rollbackInfo.warnings.length > 0) {
          logger.warn('\nReasons:')
          rollbackInfo.warnings.forEach((warning) => {
            logger.warn(`  • ${warning}`)
          })
        }
        await kyselyInstance.destroy()
        return {
          success: false,
          message: 'Migration cannot be rolled back',
        }
      }

      // Show rollback preview
      logger.info('\n📋 Rollback Preview:')
      logger.info(`   Statements to execute: ${rollbackInfo.rollbackStatements.length}`)

      if (rollbackInfo.rollbackStatements.length > 0) {
        logger.info('\n📝 Rollback SQL Statements:')
        rollbackInfo.rollbackStatements.forEach((statement, index) => {
          logger.info(`  ${index + 1}. ${statement}`)
        })
      }

      if (rollbackInfo.warnings.length > 0) {
        logger.warn('\n⚠️  Warnings:')
        rollbackInfo.warnings.forEach((warning) => {
          logger.warn(`  • ${warning}`)
        })
      }

      // Get confirmation unless --yes flag is provided
      if (!options.yes) {
        const response = await prompts(
          {
            type: 'confirm',
            name: 'confirmed',
            message: '⚠️  Are you sure you want to rollback this migration? This action cannot be undone.',
            initial: false,
          },
          {
            onCancel: () => {
              logger.info('Rollback cancelled')
              process.exit(0)
            },
          },
        )

        if (!response.confirmed) {
          logger.info('Rollback cancelled by user')
          await kyselyInstance.destroy()
          return {
            success: false,
            message: 'Rollback cancelled by user',
          }
        }
      }

      logger.info('Executing rollback...')

      // Execute rollback
      const result = await migrate.rollback(toMigrateDb(kyselyInstance), latestMigration.id)

      await kyselyInstance.destroy()

      if (result.success) {
        logger.success(
          `✅ Rollback completed successfully! (${result.statementsExecuted} statements executed in ${result.executionTime}ms)`,
        )
        return {
          success: true,
          message: 'Rollback completed successfully',
        }
      } else {
        const errorMessages = result.errors.map((e) => e.message).join(', ')
        logger.error(`❌ Rollback failed: ${errorMessages}`)
        return {
          success: false,
          message: `Rollback failed: ${errorMessages}`,
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Rollback command failed: ${errorMessage}`)

      return {
        success: false,
        message: `Rollback failed: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}
