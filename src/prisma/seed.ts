import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  const adminPassword = await bcrypt.hash('Admin@2025!', 12)
  await prisma.user.upsert({
    where: { email: 'admin@importagrupo.cl' },
    update: {},
    create: {
      email: 'admin@importagrupo.cl',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'ImportaGrupo',
      role: 'ADMIN',
      isActive: true,
    }
  })

  const userPassword = await bcrypt.hash('User@2025!', 12)
  await prisma.user.upsert({
    where: { email: 'usuario@test.cl' },
    update: {},
    create: {
      email: 'usuario@test.cl',
      password: userPassword,
      firstName: 'Carlos',
      lastName: 'González',
      phone: '+56912345678',
      isActive: true,
    }
  })

  const productos = [
    {
      slug: 'auriculares-bluetooth-tws-pro',
      name: 'Auriculares Bluetooth TWS Pro',
      description: 'Auriculares inalámbricos con cancelación de ruido activa, 30 horas de batería y carga inalámbrica.',
      shortDescription: 'ANC + 30h batería + carga inalámbrica',
      priceCLP: 18900,
      originalPrice: 32000,
      moq: 50,
      targetQuantity: 200,
      committedQuantity: 127,
      category: 'Electrónica',
      tags: ['auriculares', 'bluetooth', 'TWS'],
      isFeatured: true,
      closingDate: new Date('2025-05-31'),
      arrivalDate: new Date('2025-07-20'),
      images: [
        { url: 'https://images.unsplash.com/photo-1572536147248-ac59a8abfa4b?w=600&q=80', isMain: true, order: 0 },
        { url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80', isMain: false, order: 1 },
      ]
    },
    {
      slug: 'smartwatch-ultra-fitness',
      name: 'Smartwatch Ultra Fitness',
      description: 'Reloj inteligente con pantalla AMOLED, GPS integrado, monitor cardíaco y 14 días de batería.',
      shortDescription: 'AMOLED + GPS + 14 días batería',
      priceCLP: 28500,
      originalPrice: 55000,
      moq: 30,
      targetQuantity: 150,
      committedQuantity: 89,
      category: 'Electrónica',
      tags: ['smartwatch', 'fitness', 'GPS'],
      isFeatured: true,
      closingDate: new Date('2025-05-31'),
      arrivalDate: new Date('2025-07-20'),
      images: [
        { url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80', isMain: true, order: 0 },
      ]
    },
    {
      slug: 'mini-proyector-led-4k',
      name: 'Mini Proyector LED 4K',
      description: 'Proyector LED portátil con resolución 4K, WiFi 5G, Bluetooth y sistema Android 11.',
      shortDescription: '4K + WiFi 5G + Android 11',
      priceCLP: 62000,
      originalPrice: 120000,
      moq: 20,
      targetQuantity: 80,
      committedQuantity: 34,
      category: 'Electrónica',
      tags: ['proyector', '4K', 'portable'],
      isFeatured: true,
      closingDate: new Date('2025-05-31'),
      arrivalDate: new Date('2025-07-20'),
      images: [
        { url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&q=80', isMain: true, order: 0 },
      ]
    },
    {
      slug: 'cargador-solar-20000mah',
      name: 'Cargador Solar Portátil 20000mAh',
      description: 'Batería externa solar con carga rápida PD 65W, 3 puertos USB y resistencia al agua IPX4.',
      shortDescription: 'Solar + PD 65W + 20000mAh',
      priceCLP: 24900,
      originalPrice: 45000,
      moq: 40,
      targetQuantity: 120,
      committedQuantity: 61,
      category: 'Electrónica',
      tags: ['cargador', 'solar', 'powerbank'],
      isFeatured: false,
      closingDate: new Date('2025-05-31'),
      arrivalDate: new Date('2025-07-20'),
      images: [
        { url: 'https://images.unsplash.com/photo-1609592806596-b55f38777dfe?w=600&q=80', isMain: true, order: 0 },
      ]
    },
  ]

  for (const { images, ...data } of productos) {
    await prisma.product.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        images: { create: images }
      }
    })
    console.log(`✅ Producto: ${data.name}`)
  }

  console.log('🎉 Seed completado!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())