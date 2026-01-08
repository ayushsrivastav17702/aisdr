import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

async function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const adminFirstName = process.env.ADMIN_FIRST_NAME || 'Admin';
  const adminLastName = process.env.ADMIN_LAST_NAME || 'User';
  
  console.log('🌱 Seeding first admin user...');
  console.log('Admin email:', adminEmail);

  try {
    const existingUser = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existingUser.length > 0) {
      console.log('✅ Admin user already exists');
      console.log('User ID:', existingUser[0].id);
      console.log('Role:', existingUser[0].role);
      console.log('Status:', existingUser[0].status);
      return existingUser[0].id;
    }

    const passwordHash = await bcrypt.hash(adminPassword, SALT_ROUNDS);

    const [admin] = await db.insert(users).values({
      email: adminEmail,
      passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      username: adminEmail.split('@')[0],
      role: 'admin',
      status: 'active',
      isActive: true,
      emailVerified: true,
    }).returning();

    console.log('✅ Admin user created successfully');
    console.log('User ID:', admin.id);
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);
    console.log('---');
    console.log('Login credentials:');
    console.log('Email:', adminEmail);
    console.log('---');
    console.log('⚠️  IMPORTANT: Change the default password after first login!');

    return admin.id;
  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
    throw error;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  seedAdmin()
    .then(() => {
      console.log('🎉 Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export { seedAdmin };
