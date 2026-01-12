import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo user
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@titan-agent.dev' },
    update: {},
    create: {
      id: 'demo-user-id',
      email: 'demo@titan-agent.dev',
      passwordHash: 'hashed-password-placeholder',
      apiKey: 'dev-key-123',
      role: 'admin',
    },
  });

  console.log('✅ Demo user created:', {
    email: demoUser.email,
    apiKey: 'dev-key-123',
  });

  console.log('\n🎯 You can now use this API key for development:');
  console.log('   Authorization: Bearer dev-key-123\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
