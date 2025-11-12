import { db } from '../db';
import {
  users,
  prospects,
  searches,
  jobs,
  importRecords,
  icpTemplates,
  sequences,
  sequenceSteps,
  sequenceProspects,
  emails,
  emailReplies,
  emailMailboxes,
  emailQueue,
  emailSendLog,
  contentLibrary,
  unsubscribes,
  automationRuns
} from '@shared/schema';
import { eq, isNull, sql } from 'drizzle-orm';

async function migrateUserData(dryRun: boolean = false) {
  console.log('🔄 Starting data migration to assign existing data to admin user...');
  
  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No actual changes will be made');
    console.log('');
  }

  try {
    const adminUsers = await db
      .select()
      .from(users)
      .where(eq(users.role, 'admin'))
      .orderBy(users.createdAt)
      .limit(1);

    if (adminUsers.length === 0) {
      console.error('❌ No admin user found. Please run seed-admin.ts first.');
      process.exit(1);
    }

    const adminUserId = adminUsers[0].id;
    console.log(`✅ Found admin user: ${adminUsers[0].email} (ID: ${adminUserId})`);
    console.log('');

    const tables = [
      { name: 'prospects', table: prospects },
      { name: 'searches', table: searches },
      { name: 'jobs', table: jobs },
      { name: 'import_records', table: importRecords },
      { name: 'icp_templates', table: icpTemplates },
      { name: 'sequences', table: sequences },
      { name: 'emails', table: emails },
      { name: 'email_mailboxes', table: emailMailboxes },
      { name: 'content_library', table: contentLibrary },
      { name: 'unsubscribes', table: unsubscribes },
      { name: 'automation_runs', table: automationRuns }
    ];

    let totalMigrated = 0;

    await db.transaction(async (tx) => {
      for (const { name } of tables) {
        const countResult = await tx.execute(
          sql`SELECT COUNT(*)::int as count FROM ${sql.identifier(name)} WHERE user_id IS NULL`
        );

        const count = (countResult.rows[0] as any)?.count || 0;

        if (count > 0) {
          console.log(`📝 Found ${count} records with null userId in ${name}...`);

          if (!dryRun) {
            await tx.execute(
              sql`UPDATE ${sql.identifier(name)} SET user_id = ${adminUserId} WHERE user_id IS NULL`
            );

            console.log(`   ✅ ${count} records migrated`);
          } else {
            console.log(`   🧪 Would migrate ${count} records (dry run)`);
          }
          
          totalMigrated += count;
        } else {
          console.log(`   ⏭️  No records to migrate in ${name}`);
        }
      }
    });

    console.log('');
    console.log('═══════════════════════════════════════');
    if (dryRun) {
      console.log(`🧪 DRY RUN COMPLETE - No changes were made`);
      console.log(`📊 Total records that would be migrated: ${totalMigrated}`);
    } else {
      console.log(`🎉 Migration completed successfully!`);
      console.log(`📊 Total records migrated: ${totalMigrated}`);
      console.log(`👤 All data assigned to: ${adminUsers[0].email}`);
    }
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  const dryRun = process.argv.includes('--dry-run');
  
  if (dryRun) {
    console.log('🧪 Running in DRY RUN mode');
    console.log('Run without --dry-run flag to actually migrate data');
    console.log('');
  }
  
  migrateUserData(dryRun)
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateUserData };
