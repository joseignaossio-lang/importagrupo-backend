import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'

const app = express()
const prisma = new PrismaClient()
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_cambiar_en_produccion'
const PORT = process.env.PORT || 3001

app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}))
app.use(express.json())
app.use(cookieParser())
app.use(rateLimit({ windowMs: 60000, max: 100 }))

// ── Middleware auth ──────────────────────────────────────────
function authMiddleware(req: any, res: any, next: any) {
  const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: 'No autorizado' })
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ message: 'Token inválido' })
  }
}

function adminMiddleware(req: any, res: any, next: any) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ message: 'Solo administradores' })
  next()
}

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ImportaGrupo API funcionando' })
})

// ── AUTH ─────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' })
    }
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) return res.status(409).json({ message: 'El correo ya está registrado' })

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, firstName, lastName, phone },
      select: { id: true, email: true, firstName: true, lastName: true, role: true }
    })

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
    res.cookie('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 604800000 })
    res.status(201).json({ user, token })
  } catch (error) {
    res.status(500).json({ message: 'Error al registrar usuario' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) return res.status(401).json({ message: 'Credenciales incorrectas' })

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) return res.status(401).json({ message: 'Credenciales incorrectas' })

    const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
    res.cookie('auth_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 604800000 })

    const { password: _, ...userWithoutPassword } = user
    res.json({ user: userWithoutPassword, token })
  } catch (error) {
    res.status(500).json({ message: 'Error al iniciar sesión' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token')
  res.json({ message: 'Sesión cerrada' })
})

app.get('/api/auth/me', authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, phone: true, createdAt: true }
    })
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json(user)
  } catch {
    res.status(500).json({ message: 'Error al obtener usuario' })
  }
})

// ── PRODUCTOS ────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { featured, category, search } = req.query
    const where: any = { isActive: true, status: 'ACTIVE' }
    if (featured === 'true') where.isFeatured = true
    if (category) where.category = category
    if (search) where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { description: { contains: String(search), mode: 'insensitive' } }
    ]

    const products = await prisma.product.findMany({
      where,
      include: { images: { where: { isMain: true }, take: 1 } },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }]
    })
    res.json({ data: products })
  } catch {
    res.status(500).json({ message: 'Error al obtener productos' })
  }
})

app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { slug: req.params.slug },
      include: { images: { orderBy: { order: 'asc' } } }
    })
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' })
    res.json(product)
  } catch {
    res.status(500).json({ message: 'Error al obtener producto' })
  }
})

app.post('/api/products', authMiddleware, adminMiddleware, async (req: any, res) => {
  try {
    const { images, ...data } = req.body
    const slug = data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-') + '-' + Date.now().toString(36)
    const product = await prisma.product.create({
      data: {
        ...data,
        slug,
        images: images?.length ? { create: images.map((url: string, i: number) => ({ url, isMain: i === 0, order: i })) } : undefined
      },
      include: { images: true }
    })
    res.status(201).json(product)
  } catch (error) {
    res.status(500).json({ message: 'Error al crear producto' })
  }
})

app.patch('/api/products/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: req.body,
      include: { images: true }
    })
    res.json(product)
  } catch {
    res.status(500).json({ message: 'Error al actualizar producto' })
  }
})

// ── CARRITO ──────────────────────────────────────────────────
app.get('/api/cart', authMiddleware, async (req: any, res) => {
  try {
    let cart = await prisma.cart.findUnique({
      where: { userId: req.user.sub },
      include: { items: { include: { product: { include: { images: { where: { isMain: true }, take: 1 } } } } } }
    })
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: req.user.sub },
        include: { items: { include: { product: { include: { images: { where: { isMain: true }, take: 1 } } } } } }
      })
    }
    const total = cart.items.reduce((sum, item) => sum + item.product.priceCLP * item.quantity, 0)
    res.json({ ...cart, total })
  } catch {
    res.status(500).json({ message: 'Error al obtener carrito' })
  }
})

app.post('/api/cart/items', authMiddleware, async (req: any, res) => {
  try {
    const { productId, quantity = 1 } = req.body
    const product = await prisma.product.findUnique({ where: { id: productId } })
    if (!product || !product.isActive) return res.status(404).json({ message: 'Producto no disponible' })

    let cart = await prisma.cart.findUnique({ where: { userId: req.user.sub } })
    if (!cart) cart = await prisma.cart.create({ data: { userId: req.user.sub } })

    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: cart.id, productId } }
    })

    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } })
    } else {
      await prisma.cartItem.create({ data: { cartId: cart.id, productId, quantity } })
    }

    const updatedCart = await prisma.cart.findUnique({
      where: { userId: req.user.sub },
      include: { items: { include: { product: { include: { images: { where: { isMain: true }, take: 1 } } } } } }
    })
    const total = updatedCart!.items.reduce((sum, item) => sum + item.product.priceCLP * item.quantity, 0)
    res.json({ ...updatedCart, total })
  } catch {
    res.status(500).json({ message: 'Error al agregar al carrito' })
  }
})

app.delete('/api/cart/items/:id', authMiddleware, async (req, res) => {
  try {
    await prisma.cartItem.delete({ where: { id: req.params.id } })
    res.json({ message: 'Item eliminado' })
  } catch {
    res.status(500).json({ message: 'Error al eliminar item' })
  }
})

// ── ÓRDENES ──────────────────────────────────────────────────
app.post('/api/orders', authMiddleware, async (req: any, res) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.user.sub },
      include: { items: { include: { product: true } } }
    })
    if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'El carrito está vacío' })

    const subtotal = cart.items.reduce((sum, item) => sum + item.product.priceCLP * item.quantity, 0)
    const count = await prisma.order.count()
    const orderNumber = `IG-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: req.user.sub,
        subtotal,
        total: subtotal,
        status: 'PENDING_PAYMENT',
        items: {
          create: cart.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.product.priceCLP,
            total: item.product.priceCLP * item.quantity
          }))
        }
      },
      include: { items: { include: { product: true } }, payment: true }
    })

    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } })
    res.status(201).json(order)
  } catch {
    res.status(500).json({ message: 'Error al crear orden' })
  }
})

app.get('/api/orders', authMiddleware, async (req: any, res) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.sub },
      include: { items: { include: { product: { include: { images: { where: { isMain: true }, take: 1 } } } } }, payment: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(orders)
  } catch {
    res.status(500).json({ message: 'Error al obtener órdenes' })
  }
})

app.get('/api/orders/:id', authMiddleware, async (req: any, res) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.sub },
      include: { items: { include: { product: { include: { images: true } } } }, payment: true }
    })
    if (!order) return res.status(404).json({ message: 'Orden no encontrada' })
    res.json(order)
  } catch {
    res.status(500).json({ message: 'Error al obtener orden' })
  }
})

// ── ADMIN ────────────────────────────────────────────────────
app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [totalUsers, totalOrders, totalProducts, pendingOrders, payments] = await Promise.all([
      prisma.user.count(),
      prisma.order.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count({ where: { status: 'PENDING_PAYMENT' } }),
      prisma.payment.findMany({ where: { status: 'APPROVED' } })
    ])
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0)
    res.json({ totalUsers, totalOrders, totalProducts, pendingOrders, totalRevenue })
  } catch {
    res.status(500).json({ message: 'Error al obtener métricas' })
  }
})

app.get('/api/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        items: { include: { product: { select: { name: true } } } },
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(orders)
  } catch {
    res.status(500).json({ message: 'Error al obtener órdenes' })
  }
})

app.patch('/api/admin/orders/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: { status: req.body.status }
    })
    res.json(order)
  } catch {
    res.status(500).json({ message: 'Error al actualizar estado' })
  }
})

app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    })
    res.json(users)
  } catch {
    res.status(500).json({ message: 'Error al obtener usuarios' })
  }
})

// ── Arrancar servidor ────────────────────────────────────────
async function main() {
  await prisma.$connect()
  app.listen(PORT, () => {
    console.log(`🚀 ImportaGrupo API corriendo en puerto ${PORT}`)
  })
}

main().catch(console.error)