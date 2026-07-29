import { PrismaClient } from '@prisma/client';
import { deterministicUuid } from '../lib/ids';
import type { SeededUser } from '../types';

export async function seedAddresses(prisma: PrismaClient, customers: SeededUser[]) {
  // customers[0] is the demo John Doe account — keep the fixed `seed-address-1`
  // id it has always owned (documented in the seed guide) for backwards-compat.
  const john = customers[0];
  let addressCount = 0;

  await prisma.address.upsert({
    where: { id: 'seed-address-1' },
    update: {},
    create: {
      id: 'seed-address-1',
      userId: john.id,
      type: 'SHIPPING',
      firstName: 'John',
      lastName: 'Doe',
      address1: 'Вул. Хрещатик 22',
      city: 'Київ',
      state: 'Київська область',
      postalCode: '01001',
      country: 'UA',
      phone: '+380991234567',
      isDefault: true,
    },
  });
  addressCount++;

  // 1–2 UA addresses per new customer (deterministic ids — never `seed-address-1`).
  const addressPlans: Record<
    string,
    {
      firstName: string;
      lastName: string;
      phone: string;
      city: string;
      state: string;
      postalCode: string;
      address1: string;
      withBilling: boolean;
    }
  > = {
    'oksana@example.com': {
      firstName: 'Оксана',
      lastName: 'Шевченко',
      phone: '+380671112233',
      city: 'Львів',
      state: 'Львівська область',
      postalCode: '79000',
      address1: 'вул. Личаківська 45, кв. 12',
      withBilling: true,
    },
    'taras@example.com': {
      firstName: 'Тарас',
      lastName: 'Бондаренко',
      phone: '+380672223344',
      city: 'Одеса',
      state: 'Одеська область',
      postalCode: '65000',
      address1: 'вул. Дерибасівська 10, кв. 5',
      withBilling: false,
    },
    'mariia@example.com': {
      firstName: 'Марія',
      lastName: 'Коваль',
      phone: '+380673334455',
      city: 'Харків',
      state: 'Харківська область',
      postalCode: '61000',
      address1: 'просп. Науки 14, кв. 88',
      withBilling: true,
    },
    'dmytro@example.com': {
      firstName: 'Дмитро',
      lastName: 'Ткаченко',
      phone: '+380674445566',
      city: 'Дніпро',
      state: 'Дніпропетровська область',
      postalCode: '49000',
      address1: 'просп. Дмитра Яворницького 60, кв. 21',
      withBilling: false,
    },
    'nataliia@example.com': {
      firstName: 'Наталія',
      lastName: 'Кравченко',
      phone: '+380675556677',
      city: 'Київ',
      state: 'Київська область',
      postalCode: '02000',
      address1: 'вул. Володимирська 5, кв. 3',
      withBilling: false,
    },
  };

  for (const customer of customers) {
    const plan = addressPlans[customer.email];
    if (!plan) continue;

    await prisma.address.upsert({
      where: { id: deterministicUuid(`address-${customer.email}-1`) },
      update: {},
      create: {
        id: deterministicUuid(`address-${customer.email}-1`),
        userId: customer.id,
        type: 'SHIPPING',
        firstName: plan.firstName,
        lastName: plan.lastName,
        address1: plan.address1,
        city: plan.city,
        state: plan.state,
        postalCode: plan.postalCode,
        country: 'UA',
        phone: plan.phone,
        isDefault: true,
      },
    });
    addressCount++;

    if (plan.withBilling) {
      await prisma.address.upsert({
        where: { id: deterministicUuid(`address-${customer.email}-2`) },
        update: {},
        create: {
          id: deterministicUuid(`address-${customer.email}-2`),
          userId: customer.id,
          type: 'BILLING',
          firstName: plan.firstName,
          lastName: plan.lastName,
          address1: plan.address1,
          city: plan.city,
          state: plan.state,
          postalCode: plan.postalCode,
          country: 'UA',
          phone: plan.phone,
          isDefault: false,
        },
      });
      addressCount++;
    }
  }

  console.log(`  ✓ Addresses: ${addressCount} across ${customers.length} customers`);
}
