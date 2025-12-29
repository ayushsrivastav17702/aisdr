import { db } from '../db';
import { superAdmins } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function seedSuperAdmin() {
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || 'superadmin@example.com';
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin123!';
  const superAdminFirstName = process.env.SUPER_ADMIN_FIRST_NAME || 'Super';
  const superAdminLastName = process.env.SUPER_ADMIN_LAST_NAME || 'Admin';
  
  console.log('🔒 Seeding first Super Admin user...');
  console.log('Super Admin email:', superAdminEmail);

  try {
    const existingSuperAdmin = await db
      .select()
      .from(superAdmins)
      .where(eq(superAdmins.email, superAdminEmail.toLowerCase()))
      .limit(1);

    if (existingSuperAdmin.length > 0) {
      console.log('✅ Super Admin already exists');
      console.log('Super Admin ID:', existingSuperAdmin[0].id);
      console.log('Is Master Admin:', existingSuperAdmin[0].isMasterAdmin);
      console.log('Status:', existingSuperAdmin[0].status);
      return existingSuperAdmin[0].id;
    }

    const passwordHash = await bcrypt.hash(superAdminPassword, SALT_ROUNDS);

    const [superAdmin] = await db.insert(superAdmins).values({
      email: superAdminEmail.toLowerCase(),
      passwordHash,
      firstName: superAdminFirstName,
      lastName: superAdminLastName,
      isMasterAdmin: true,
      status: 'active',
      permissions: {
        canProvisionTenants: true,
        canManageBilling: true,
        canImpersonateManagers: true,
        canSuspendTenants: true,
        canDeleteTenants: true,
        canViewAllData: true,
      },
    }).returning();

    console.log('✅ Super Admin created successfully');
    console.log('Super Admin ID:', superAdmin.id);
    console.log('Email:', superAdmin.email);
    console.log('Is Master Admin:', superAdmin.isMasterAdmin);
    console.log('---');
    console.log('Login credentials:');
    console.log('Email:', superAdminEmail);
    console.log('Password:', superAdminPassword);
    console.log('---');
    console.log('⚠️  IMPORTANT: Change the default password after first login!');
    console.log('⚠️  Access the Super Admin portal at: /super-admin/login');

    return superAdmin.id;
  } catch (error) {
    console.error('❌ Error seeding super admin:', error);
    throw error;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  seedSuperAdmin()
    .then(() => {
      console.log('🎉 Super Admin seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Super Admin seeding failed:', error);
      process.exit(1);
    });
}

export { seedSuperAdmin };
