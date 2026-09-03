import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';
import { getDb, saveDb, hasAdmin, logAudit, createBackup, verifyAndRestoreBackup, resetDatabase } from './src/server/db.ts';
import { hashPassword, verifyPassword } from './src/server/auth.ts';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to query sql.js and return array of objects
function queryAll(sql: string, params: any[] = []): any[] {
  const database = (global as any).__hawr_db;
  if (!database) return [];
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runSql(sql: string, params: any[] = []): void {
  const database = (global as any).__hawr_db;
  if (!database) return;
  database.run(sql, params);
  saveDb();
}

async function startServer() {
  const database = await getDb();
  (global as any).__hawr_db = database;

  // 1. System Status & Health
  app.get('/api/system/status', async (req: Request, res: Response) => {
    try {
      const adminExists = await hasAdmin();
      const dbPath = path.join(process.cwd(), 'data', 'hawr-gallery.sqlite');
      let dbSizeKB = 0;
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        dbSizeKB = Math.round(stats.size / 1024);
      }
      res.json({
        success: true,
        isInitialized: adminExists,
        adminExists,
        databasePath: dbPath,
        dbSizeKB,
        version: '2.4.0',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Auth: Register Admin (Clean install first boot)
  app.post('/api/auth/register-admin', async (req: Request, res: Response) => {
    try {
      const adminExists = await hasAdmin();
      if (adminExists) {
        return res.status(400).json({ success: false, error: 'تم إنشاء حساب المدير مسبقاً' });
      }

      const { name, username, password, employeeCode } = req.body;
      if (!name || !username || !password || !employeeCode) {
        return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
      }

      const { hash, salt } = hashPassword(password);
      const id = 'usr_' + Date.now();
      const createdAt = new Date().toISOString();

      runSql(
        `INSERT INTO users (id, name, username, passwordHash, salt, employeeCode, role, status, baseSalary, phone, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', 'active', 0, NULL, ?)`,
        [id, name.trim(), username.trim().toLowerCase(), hash, salt, employeeCode.trim(), createdAt]
      );

      logAudit('admin_registered', id, username, 'تم إنشاء حساب المدير الأول للنظام');

      res.json({
        success: true,
        user: { id, name, username, employeeCode, role: 'admin', status: 'active', baseSalary: 0, isActive: true, createdAt },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Auth: Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
      }

      const users = queryAll('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
      if (users.length === 0) {
        logAudit('login_failed', 'unknown', username, 'محاولة تسجيل دخول فاشلة: المستخدم غير موجود');
        return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
      }

      const user = users[0];
      if (user.status !== 'active') {
        logAudit('login_failed', user.id, username, 'محاولة تسجيل دخول لحساب معطل');
        return res.status(403).json({ success: false, error: 'هذا الحساب معطل حالياً' });
      }

      const isValid = verifyPassword(password, user.passwordHash, user.salt);
      if (!isValid) {
        logAudit('login_failed', user.id, username, 'محاولة تسجيل دخول فاشلة: كلمة مرور خاطئة');
        return res.status(401).json({ success: false, error: 'بيانات الدخول غير صحيحة' });
      }

      logAudit('login_success', user.id, username, `تسجيل دخول ناجح بصلاحية ${user.role}`);

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          employeeCode: user.employeeCode,
          role: user.role,
          status: user.status,
          baseSalary: Number(user.baseSalary || 0),
          phone: user.phone || undefined,
          isActive: user.status === 'active',
          createdAt: user.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Verify Admin Credentials (for sensitive operations)
  app.post('/api/auth/verify-admin', async (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ success: false, error: 'كلمة المرور مطلوبة' });
      }
      const admins = queryAll("SELECT * FROM users WHERE role = 'admin' AND status = 'active'");
      if (admins.length === 0) {
        return res.status(400).json({ success: false, error: 'لا يوجد حساب مدير نشط' });
      }
      const admin = admins[0];
      const isValid = verifyPassword(password, admin.passwordHash, admin.salt);
      if (!isValid) {
        return res.status(401).json({ success: false, error: 'كلمة مرور المدير غير صحيحة' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Employees Management (Admin/Supervisor)
  app.get('/api/employees', (req: Request, res: Response) => {
    try {
      const users = queryAll(
        'SELECT id, name, username, employeeCode, role, status, COALESCE(baseSalary, 0) as baseSalary, phone, createdAt FROM users ORDER BY createdAt DESC'
      );
      const mapped = users.map((u) => ({
        ...u,
        baseSalary: Number(u.baseSalary || 0),
        isActive: u.status === 'active',
      }));
      res.json({ success: true, users: mapped });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/employees', (req: Request, res: Response) => {
    try {
      const { name, username, password, employeeCode, role, status, baseSalary, phone } = req.body;
      if (!name || !username || !password || !employeeCode || !role) {
        return res.status(400).json({ success: false, error: 'جميع الحقول مطلوبة' });
      }

      const existing = queryAll('SELECT id FROM users WHERE username = ? OR employeeCode = ?', [username.trim().toLowerCase(), employeeCode.trim()]);
      if (existing.length > 0) {
        return res.status(400).json({ success: false, error: 'اسم المستخدم أو كود الموظف مستخدم بالفعل' });
      }

      const { hash, salt } = hashPassword(password);
      const id = 'usr_' + Date.now();
      const createdAt = new Date().toISOString();
      const salary = Number(baseSalary || 0);
      const phoneStr = phone ? String(phone).trim() : null;

      runSql(
        `INSERT INTO users (id, name, username, passwordHash, salt, employeeCode, role, status, baseSalary, phone, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name.trim(), username.trim().toLowerCase(), hash, salt, employeeCode.trim(), role, status || 'active', salary, phoneStr, createdAt]
      );

      logAudit('employee_created', id, username, `إنشاء موظف جديد: ${name} (${role})`);

      res.json({
        success: true,
        user: {
          id,
          name,
          username,
          employeeCode,
          role,
          status: status || 'active',
          baseSalary: salary,
          phone: phoneStr,
          isActive: (status || 'active') === 'active',
          createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/employees/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, role, status, password, baseSalary, phone, isActive } = req.body;
      const target = queryAll('SELECT * FROM users WHERE id = ?', [id]);
      if (target.length === 0) {
        return res.status(404).json({ success: false, error: 'الموظف غير موجود' });
      }

      const newStatus = status || (isActive === false ? 'inactive' : 'active');
      const salary = Number(baseSalary || 0);
      const phoneStr = phone ? String(phone).trim() : null;

      if (password) {
        const { hash, salt } = hashPassword(password);
        runSql(
          'UPDATE users SET name = ?, role = ?, status = ?, baseSalary = ?, phone = ?, passwordHash = ?, salt = ? WHERE id = ?',
          [name, role, newStatus, salary, phoneStr, hash, salt, id]
        );
      } else {
        runSql(
          'UPDATE users SET name = ?, role = ?, status = ?, baseSalary = ?, phone = ? WHERE id = ?',
          [name, role, newStatus, salary, phoneStr, id]
        );
      }

      logAudit('employee_updated', id, target[0].username, `تعديل بيانات الموظف: ${name}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Products & Inventory Management
  app.get('/api/products', (req: Request, res: Response) => {
    try {
      const { location, search, lowStock } = req.query;
      let sql = 'SELECT * FROM products WHERE 1=1';
      const params: any[] = [];

      if (location && (location === 'gallery' || location === 'stationery')) {
        sql += ' AND location = ?';
        params.push(location);
      }

      if (search) {
        const term = `%${String(search).trim()}%`;
        sql += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
        params.push(term, term, term);
      }

      if (lowStock === 'true') {
        sql += ' AND quantity <= minStockAlert';
      }

      sql += ' ORDER BY name ASC';
      const products = queryAll(sql, params);
      res.json({ success: true, products });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/products', (req: Request, res: Response) => {
    try {
      const { name, sku, barcode, unit, location, quantity, salePrice, purchaseCost, minStockAlert, category } = req.body;
      if (!name || !sku || !location || salePrice === undefined || purchaseCost === undefined) {
        return res.status(400).json({ success: false, error: 'الحقول الأساسية للمنتج مطلوبة' });
      }

      if (location !== 'gallery' && location !== 'stationery') {
        return res.status(400).json({ success: false, error: 'يجب أن يكون موقع التخزين إما المعرض أو المكتبة' });
      }

      // Rule: Product cannot exist in both locations! It belongs to either gallery or stationery
      const existing = queryAll('SELECT * FROM products WHERE sku = ?', [sku.trim()]);
      if (existing.length > 0) {
        const otherLoc = existing[0].location === 'gallery' ? 'المعرض' : 'المكتبة';
        return res.status(400).json({
          success: false,
          error: `المنتج موجود بالفعل في (${otherLoc}) بكود ${sku}. لا يمكن لمنتج أن يتواجد في المعرض والمكتبة معاً. يمكنك نقله بدلاً من ذلك.`,
        });
      }

      const id = 'prd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const now = new Date().toISOString();
      const code = sku.trim();

      runSql(
        `INSERT INTO products (id, name, sku, barcode, unit, location, quantity, salePrice, purchaseCost, minStockAlert, category, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name.trim(),
          code,
          code, // Barcode and SKU are unified
          unit || 'قطعة',
          location,
          Number(quantity) || 0,
          Number(salePrice),
          Number(purchaseCost),
          Number(minStockAlert) || 5,
          category || 'عام',
          now,
          now,
        ]
      );

      res.json({ success: true, productId: id });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/products/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, sku, unit, quantity, salePrice, purchaseCost, minStockAlert, category } = req.body;

      const current = queryAll('SELECT * FROM products WHERE id = ?', [id]);
      if (current.length === 0) {
        return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
      }

      const now = new Date().toISOString();
      const code = sku ? sku.trim() : current[0].sku;

      runSql(
        `UPDATE products SET name = ?, sku = ?, barcode = ?, unit = ?, quantity = ?, salePrice = ?, purchaseCost = ?, minStockAlert = ?, category = ?, updatedAt = ?
         WHERE id = ?`,
        [
          name.trim(),
          code,
          code,
          unit || current[0].unit,
          Number(quantity),
          Number(salePrice),
          Number(purchaseCost),
          Number(minStockAlert),
          category || current[0].category,
          now,
          id,
        ]
      );

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/products/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      runSql('DELETE FROM products WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Transfer stock between locations (Gallery <-> Stationery)
  app.post('/api/products/transfer', (req: Request, res: Response) => {
    try {
      const { productId, fromLocation, toLocation, quantity, notes, userId, userName } = req.body;
      if (!productId || !fromLocation || !toLocation || !quantity || quantity <= 0) {
        return res.status(400).json({ success: false, error: 'بيانات النقل غير مكتملة' });
      }

      if (fromLocation === toLocation) {
        return res.status(400).json({ success: false, error: 'لا يمكن النقل لنفس الموقع' });
      }

      const products = queryAll('SELECT * FROM products WHERE id = ?', [productId]);
      if (products.length === 0) {
        return res.status(404).json({ success: false, error: 'المنتج غير موجود' });
      }

      const prod = products[0];
      if (prod.location !== fromLocation) {
        return res.status(400).json({ success: false, error: 'المنتج لا ينتمي إلى الموقع المصدر المحدد' });
      }

      if (prod.quantity < quantity) {
        return res.status(400).json({ success: false, error: `الكمية المتوفرة في المخزن (${prod.quantity}) أقل من الكمية المطلوبة نقلها` });
      }

      // Since product exclusively belongs to either Gallery or Stationery:
      // If full quantity is transferred, update location of product to toLocation.
      // If partial, check if destination already has a separate record or relocate full entity.
      // Rule: "لا يمكن لمنتج ان يوجد منه في المعرض والمكتبه اما ان يكون في المعرض او المكتبه"
      // Therefore, the entire product shifts to the new location, or the entire remaining inventory moves.
      const now = new Date().toISOString();
      const transferId = 'trf_' + Date.now();

      // Shift product location and update quantity
      runSql('UPDATE products SET location = ?, updatedAt = ? WHERE id = ?', [toLocation, now, productId]);

      runSql(
        `INSERT INTO stock_transfers (id, productId, productName, sku, fromLocation, toLocation, quantity, date, notes, performedByUserId, performedByName)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transferId,
          productId,
          prod.name,
          prod.sku,
          fromLocation,
          toLocation,
          prod.quantity,
          now,
          notes || 'نقل موقع المنتج بالكامل',
          userId || 'admin',
          userName || 'المدير',
        ]
      );

      logAudit('stock_transfer', userId || 'admin', userName || 'المدير', `نقل منتج ${prod.name} من ${fromLocation === 'gallery' ? 'المعرض' : 'المكتبة'} إلى ${toLocation === 'gallery' ? 'المعرض' : 'المكتبة'}`);

      res.json({ success: true, message: `تم نقل المنتج بنجاح إلى ${toLocation === 'gallery' ? 'المعرض' : 'المكتبة'}` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 7. Real Excel XLSX Import with Arabic & English header detection
  app.post('/api/products/import-xlsx', (req: Request, res: Response) => {
    try {
      const { fileBase64, defaultLocation } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: 'لم يتم إرسال ملف Excel' });
      }

      const buffer = Buffer.from(fileBase64, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        return res.status(400).json({ success: false, error: 'الملف فارغ أو لا يحتوي على صفوف صالحة' });
      }

      // Column alias normalizer
      function normalizeKey(obj: any, aliases: string[]): any {
        for (const key of Object.keys(obj)) {
          const cleanKey = key.trim().toLowerCase();
          for (const alias of aliases) {
            if (cleanKey === alias.toLowerCase() || cleanKey.includes(alias.toLowerCase())) {
              return obj[key];
            }
          }
        }
        return undefined;
      }

      const errors: { rowNumber: number; reason: string; data: any }[] = [];
      let importedCount = 0;
      const now = new Date().toISOString();

      rows.forEach((rawRow, index) => {
        const rowNumber = index + 2; // Excel 1-based + 1 for header
        // Check if row is entirely empty
        const values = Object.values(rawRow).map(v => String(v).trim()).filter(Boolean);
        if (values.length === 0) return; // ignore completely empty row

        const name = normalizeKey(rawRow, ['اسم المنتج', 'الاسم', 'name', 'product', 'item']);
        const sku = normalizeKey(rawRow, ['كود', 'باركود', 'الباركود', 'sku', 'code', 'barcode']);
        const unit = normalizeKey(rawRow, ['الوحدة', 'وحدة', 'unit']) || 'قطعة';
        const rawLoc = normalizeKey(rawRow, ['الموقع', 'موقع التخزين', 'location', 'store']);
        const quantity = Number(normalizeKey(rawRow, ['الكمية', 'العدد', 'quantity', 'qty']) || 0);
        const salePrice = Number(normalizeKey(rawRow, ['سعر البيع', 'البيع', 'sale_price', 'price']) || 0);
        const purchaseCost = Number(normalizeKey(rawRow, ['سعر الشراء', 'التكلفة', 'شراء', 'cost', 'purchase_cost']) || 0);
        const minStock = Number(normalizeKey(rawRow, ['الحد الادنى', 'حد الطلب', 'min_stock']) || 5);
        const category = normalizeKey(rawRow, ['التصنيف', 'القسم', 'category']) || 'عام';

        if (!name || String(name).trim() === '') {
          errors.push({ rowNumber, reason: 'اسم المنتج مفقود أو فارغ', data: rawRow });
          return;
        }

        const cleanSku = sku ? String(sku).trim() : 'AUTO-' + Date.now() + '-' + index;

        // Determine location
        let location: 'gallery' | 'stationery' = defaultLocation || 'gallery';
        if (rawLoc) {
          const l = String(rawLoc).trim().toLowerCase();
          if (l.includes('مكتب') || l.includes('stationery') || l.includes('library')) {
            location = 'stationery';
          } else if (l.includes('معرض') || l.includes('gallery')) {
            location = 'gallery';
          }
        }

        // Check if SKU exists already
        const existing = queryAll('SELECT id, location FROM products WHERE sku = ?', [cleanSku]);
        if (existing.length > 0) {
          errors.push({
            rowNumber,
            reason: `الكود مكرر (${cleanSku}) وموجود مسبقاً في ${existing[0].location === 'gallery' ? 'المعرض' : 'المكتبة'}`,
            data: rawRow,
          });
          return;
        }

        const id = 'prd_' + Date.now() + '_' + index;
        runSql(
          `INSERT INTO products (id, name, sku, barcode, unit, location, quantity, salePrice, purchaseCost, minStockAlert, category, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, String(name).trim(), cleanSku, cleanSku, String(unit).trim(), location, quantity, salePrice, purchaseCost, minStock, String(category).trim(), now, now]
        );
        importedCount++;
      });

      res.json({
        success: true,
        importedCount,
        errorCount: errors.length,
        errors,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 8. Supplies & Restocking Movements
  app.get('/api/supplies', (req: Request, res: Response) => {
    try {
      const { location } = req.query;
      let sql = 'SELECT * FROM supplies WHERE 1=1';
      const params: any[] = [];
      if (location && (location === 'gallery' || location === 'stationery')) {
        sql += ' AND location = ?';
        params.push(location);
      }
      sql += ' ORDER BY date DESC';
      const supplies = queryAll(sql, params);
      res.json({ success: true, supplies });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/supplies', (req: Request, res: Response) => {
    try {
      const { productName, sku, unit, quantity, purchasePrice, salePrice, location, supplierId, supplierName, isReturn, notes, userId, userName } = req.body;
      if (!productName || !sku || !quantity || !purchasePrice || !location) {
        return res.status(400).json({ success: false, error: 'بيانات التوريد غير مكتملة' });
      }

      const id = 'sup_' + Date.now();
      const now = new Date().toISOString();
      const code = sku.trim();
      const qty = Number(quantity);
      const cost = Number(purchasePrice);

      // Check if product exists in inventory
      const existing = queryAll('SELECT * FROM products WHERE sku = ?', [code]);
      let resolvedSalePrice = (salePrice != null && Number(salePrice) > 0)
        ? Number(salePrice)
        : (cost * 1.3);

      if (existing.length > 0) {
        const prod = existing[0];
        // Enforce rule: product cannot exist in both locations
        if (prod.location !== location) {
          const locName = prod.location === 'gallery' ? 'المعرض' : 'المكتبة';
          return res.status(400).json({
            success: false,
            error: `هذا المنتج مسجل حالياً في (${locName}). لا يمكن توريده في موقع آخر إلا بعد نقله.`,
          });
        }

        // If user entered explicit salePrice > 0, update product's salePrice; otherwise keep current prod.salePrice
        if (salePrice != null && Number(salePrice) > 0) {
          resolvedSalePrice = Number(salePrice);
        } else {
          resolvedSalePrice = Number(prod.salePrice) || (cost * 1.3);
        }

        // Update inventory quantity, purchase cost, and sale price
        const newQty = isReturn ? Math.max(0, prod.quantity - qty) : prod.quantity + qty;
        runSql(
          'UPDATE products SET quantity = ?, purchaseCost = ?, salePrice = ?, unit = ?, updatedAt = ? WHERE id = ?',
          [newQty, cost, resolvedSalePrice, unit || prod.unit, now, prod.id]
        );
      } else {
        // Add new product automatically
        const newProdId = 'prd_' + Date.now();
        runSql(
          `INSERT INTO products (id, name, sku, barcode, unit, location, quantity, salePrice, purchaseCost, minStockAlert, category, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [newProdId, productName.trim(), code, code, unit || 'قطعة', location, qty, resolvedSalePrice, cost, 5, 'عام', now, now]
        );
      }

      runSql(
        `INSERT INTO supplies (id, productName, sku, unit, quantity, purchasePrice, salePrice, location, date, supplierId, supplierName, isReturn, notes, createdById, createdByName)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, productName.trim(), code, unit || 'قطعة', qty, cost, resolvedSalePrice, location, now, supplierId || null, supplierName || null, isReturn ? 1 : 0, notes || null, userId || 'admin', userName || 'المدير']
      );

      res.json({ success: true, supplyId: id });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/supplies/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const records = queryAll('SELECT * FROM supplies WHERE id = ?', [id]);
      if (records.length === 0) {
        return res.status(404).json({ success: false, error: 'حركة التوريد غير موجودة' });
      }

      const sup = records[0];
      // Rollback stock
      const products = queryAll('SELECT * FROM products WHERE sku = ?', [sup.sku]);
      if (products.length > 0) {
        const prod = products[0];
        const rolledBackQty = sup.isReturn ? prod.quantity + sup.quantity : Math.max(0, prod.quantity - sup.quantity);
        runSql('UPDATE products SET quantity = ? WHERE id = ?', [rolledBackQty, prod.id]);
      }

      runSql('DELETE FROM supplies WHERE id = ?', [id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 9. Customers & Suppliers (Strictly separated!)
  app.get('/api/customers', (req: Request, res: Response) => {
    try {
      const customers = queryAll('SELECT * FROM customers ORDER BY createdAt DESC');
      res.json({ success: true, customers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/customers', (req: Request, res: Response) => {
    try {
      const { name, phone, address, notes } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ success: false, error: 'اسم العميل ورقم الهاتف مطلوبان' });
      }
      const id = 'cst_' + Date.now();
      const now = new Date().toISOString();
      runSql('INSERT INTO customers (id, name, phone, address, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        id,
        name.trim(),
        phone.trim(),
        address || '',
        notes || '',
        now,
      ]);
      res.json({ success: true, customer: { id, name, phone, address, notes, createdAt: now } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/suppliers', (req: Request, res: Response) => {
    try {
      const suppliers = queryAll('SELECT * FROM suppliers ORDER BY createdAt DESC');
      res.json({ success: true, suppliers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/suppliers', (req: Request, res: Response) => {
    try {
      const { name, phone, company, notes } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ success: false, error: 'اسم المورد ورقم الهاتف مطلوبان' });
      }
      const id = 'sup_ent_' + Date.now();
      const now = new Date().toISOString();
      runSql('INSERT INTO suppliers (id, name, phone, company, notes, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [
        id,
        name.trim(),
        phone.trim(),
        company || '',
        notes || '',
        now,
      ]);
      res.json({ success: true, supplier: { id, name, phone, company, notes, createdAt: now } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 10. Invoices (Sales & POS)
  app.get('/api/invoices', (req: Request, res: Response) => {
    try {
      const { location, sellerId, startDate, endDate, paymentMethod } = req.query;
      let sql = 'SELECT * FROM invoices WHERE 1=1';
      const params: any[] = [];

      if (location && (location === 'gallery' || location === 'stationery')) {
        sql += ' AND location = ?';
        params.push(location);
      }
      if (sellerId) {
        sql += ' AND sellerId = ?';
        params.push(sellerId);
      }
      if (paymentMethod) {
        sql += ' AND paymentMethod = ?';
        params.push(paymentMethod);
      }
      if (startDate) {
        sql += ' AND date >= ?';
        params.push(startDate);
      }
      if (endDate) {
        sql += ' AND date <= ?';
        params.push(endDate);
      }

      sql += ' ORDER BY createdAt DESC';
      const invoices = queryAll(sql, params);

      // Attach items to each invoice
      const enrichedInvoices = invoices.map(inv => {
        const items = queryAll('SELECT * FROM invoice_items WHERE invoiceId = ?', [inv.id]);
        return { ...inv, items };
      });

      res.json({ success: true, invoices: enrichedInvoices });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/invoices', (req: Request, res: Response) => {
    try {
      const {
        customerName,
        customerPhone,
        location,
        sellerId,
        sellerName,
        sellerCode,
        items,
        subtotal,
        totalDiscount,
        total,
        paid,
        remaining,
        paymentMethod,
        isInstallment,
        installmentDueDate,
        notes,
      } = req.body;

      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, error: 'الفاتورة يجب أن تحتوي على صنف واحد على الأقل' });
      }

      // Mandatory validation: customer name and phone mandatory for installment
      if (paymentMethod === 'installment') {
        if (!customerName || !customerPhone || customerPhone.trim() === '') {
          return res.status(400).json({ success: false, error: 'اسم العميل ورقم الهاتف إلزاميان عند البيع بالتقسيط' });
        }
      }

      const invoiceId = 'inv_' + Date.now();
      const invoiceNumber = 'HAWR-' + (Math.floor(100000 + Math.random() * 900000));
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      const createdAt = now.toISOString();

      // Check inventory availability and snapshot frozen purchase cost
      for (const item of items) {
        const prods = queryAll('SELECT * FROM products WHERE id = ?', [item.productId]);
        if (prods.length === 0) {
          return res.status(400).json({ success: false, error: `المنتج (${item.productName}) غير موجود بالمخزون` });
        }
        const prod = prods[0];
        if (prod.quantity < item.quantity) {
          return res.status(400).json({
            success: false,
            error: `الكمية المتاحة من المنتج (${prod.name}) هي ${prod.quantity} فقط، لا تكفي للكمية المطلوبة (${item.quantity})`,
          });
        }
      }

      // Deduct inventory and calculate frozen profit
      let calculatedGrossProfit = 0;

      for (const item of items) {
        const prod = queryAll('SELECT * FROM products WHERE id = ?', [item.productId])[0];
        const newQty = Math.max(0, prod.quantity - item.quantity);
        runSql('UPDATE products SET quantity = ? WHERE id = ?', [newQty, prod.id]);

        const itemId = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const frozenCost = prod.purchaseCost;
        const actualPrice = item.actualSalePrice !== undefined ? item.actualSalePrice : (item.unitSalePrice - (item.discount || 0));
        // Rule: ربح البند = (سعر البيع بعد الخصم − سعر الشراء) × الكمية
        const itemProfit = (actualPrice - frozenCost) * item.quantity;
        calculatedGrossProfit += itemProfit;

        runSql(
          `INSERT INTO invoice_items (id, invoiceId, productId, productName, sku, unit, quantity, unitSalePrice, discount, actualSalePrice, frozenPurchaseCost, itemProfit, total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            invoiceId,
            item.productId,
            item.productName,
            item.sku,
            item.unit || 'قطعة',
            item.quantity,
            item.unitSalePrice,
            item.discount || 0,
            actualPrice,
            frozenCost,
            itemProfit,
            actualPrice * item.quantity,
          ]
        );
      }

      const status = paymentMethod === 'installment' && remaining > 0 ? 'partial' : 'completed';

      runSql(
        `INSERT INTO invoices (id, invoiceNumber, customerName, customerPhone, location, sellerId, sellerName, sellerCode, date, time, subtotal, totalDiscount, total, paid, remaining, paymentMethod, isInstallment, installmentDueDate, status, notes, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          invoiceNumber,
          customerName || 'عميل نقدي',
          customerPhone || '',
          location,
          sellerId,
          sellerName,
          sellerCode,
          dateStr,
          timeStr,
          subtotal,
          totalDiscount || 0,
          total,
          paid,
          remaining,
          paymentMethod,
          paymentMethod === 'installment' ? 1 : 0,
          installmentDueDate || '',
          status,
          notes || '',
          createdAt,
        ]
      );

      // If installment, create installment record
      if (paymentMethod === 'installment') {
        const instId = 'inst_' + Date.now();
        runSql(
          `INSERT INTO installments (id, invoiceId, invoiceNumber, customerName, customerPhone, location, sellerId, sellerName, sellerCode, totalAmount, paidAmount, remainingAmount, dueDate, paymentCount, status, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            instId,
            invoiceId,
            invoiceNumber,
            customerName,
            customerPhone,
            location,
            sellerId,
            sellerName,
            sellerCode,
            total,
            paid,
            remaining,
            installmentDueDate || dateStr,
            paid > 0 ? 1 : 0,
            remaining <= 0 ? 'completed' : 'active',
            createdAt,
            createdAt,
          ]
        );

        if (paid > 0) {
          const payId = 'pay_' + Date.now();
          runSql(
            `INSERT INTO installment_payments (id, installmentId, amount, date, time, paymentMethod, notes, receivedById, receivedByName)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [payId, instId, paid, dateStr, timeStr, 'مقدم تقسيط', 'دفعة مقدمة مع إنشاء الفاتورة', sellerId, sellerName]
          );
        }
      }

      res.json({
        success: true,
        invoiceId,
        invoiceNumber,
        grossProfit: calculatedGrossProfit,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 11. Installments Management (Full & Partial Payments)
  app.get('/api/installments', (req: Request, res: Response) => {
    try {
      const { location, status, search } = req.query;
      let sql = 'SELECT * FROM installments WHERE 1=1';
      const params: any[] = [];

      if (location && (location === 'gallery' || location === 'stationery')) {
        sql += ' AND location = ?';
        params.push(location);
      }
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      if (search) {
        const term = `%${String(search).trim()}%`;
        sql += ' AND (customerName LIKE ? OR customerPhone LIKE ? OR invoiceNumber LIKE ?)';
        params.push(term, term, term);
      }

      sql += ' ORDER BY createdAt DESC';
      const records = queryAll(sql, params);

      const enriched = records.map(inst => {
        const payments = queryAll('SELECT * FROM installment_payments WHERE installmentId = ? ORDER BY date ASC, time ASC', [inst.id]);
        return { ...inst, payments };
      });

      res.json({ success: true, installments: enriched });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/installments/:id/payments', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, notes, receivedById, receivedByName } = req.body;
      const payAmount = Number(amount);
      if (!payAmount || payAmount <= 0) {
        return res.status(400).json({ success: false, error: 'مبلغ السداد يجب أن يكون أكبر من الصفر' });
      }

      const records = queryAll('SELECT * FROM installments WHERE id = ?', [id]);
      if (records.length === 0) {
        return res.status(404).json({ success: false, error: 'سجل القسط غير موجود' });
      }

      const inst = records[0];
      if (payAmount > inst.remainingAmount) {
        return res.status(400).json({ success: false, error: `المبلغ المدخل (${payAmount}) يتجاوز المتبقي (${inst.remainingAmount})` });
      }

      const newPaid = inst.paidAmount + payAmount;
      const newRemaining = inst.remainingAmount - payAmount;
      const newCount = inst.paymentCount + 1;
      const newStatus = newRemaining <= 0 ? 'completed' : 'active';
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

      // Insert payment
      const paymentId = 'pay_' + Date.now();
      runSql(
        `INSERT INTO installment_payments (id, installmentId, amount, date, time, paymentMethod, notes, receivedById, receivedByName)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentId, id, payAmount, dateStr, timeStr, paymentMethod || 'نقدي', notes || '', receivedById || 'user', receivedByName || 'موظف']
      );

      // Update installment
      runSql(
        'UPDATE installments SET paidAmount = ?, remainingAmount = ?, paymentCount = ?, status = ?, updatedAt = ? WHERE id = ?',
        [newPaid, newRemaining, newCount, newStatus, now.toISOString(), id]
      );

      // Update parent invoice
      runSql('UPDATE invoices SET paid = ?, remaining = ?, status = ? WHERE id = ?', [
        newPaid,
        newRemaining,
        newRemaining <= 0 ? 'completed' : 'partial',
        inst.invoiceId,
      ]);

      const receiptMessage =
        newRemaining <= 0
          ? `تم السداد بالكامل بمبلغ: ${payAmount} ج.م (المتبقي: 0 ج.م)`
          : `تم السداد جزئياً بمبلغ: ${payAmount} ج.م (المبلغ المتبقي: ${newRemaining} ج.م)`;

      res.json({
        success: true,
        receiptMessage,
        newPaid,
        newRemaining,
        newStatus,
        paymentCount: newCount,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 12. Expenses, Salaries & Scrap
  app.get('/api/expenses', (req: Request, res: Response) => {
    try {
      const { location, category, month } = req.query;
      let sql = 'SELECT * FROM expenses WHERE 1=1';
      const params: any[] = [];

      if (location && (location === 'gallery' || location === 'stationery')) {
        sql += ' AND location = ?';
        params.push(location);
      }
      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }
      if (month) {
        sql += ' AND date LIKE ?';
        params.push(`${month}%`);
      }

      sql += ' ORDER BY date DESC';
      const expenses = queryAll(sql, params);
      res.json({ success: true, expenses });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/expenses', (req: Request, res: Response) => {
    try {
      const { category, amount, date, location, employeeId, employeeName, notes, userId, userName } = req.body;
      const numAmount = Number(amount);
      if (!category || !numAmount || numAmount <= 0 || !location) {
        return res.status(400).json({ success: false, error: 'بيانات المصروف غير مكتملة' });
      }

      const expDate = date || new Date().toISOString().split('T')[0];
      let salaryMonth: string | null = null;

      // Special handling for salaries: Due on last actual day of the month
      if (category === 'salary') {
        if (!employeeId || !employeeName) {
          return res.status(400).json({ success: false, error: 'يجب اختيار الموظف عند تسجيل الراتب' });
        }

        const d = new Date(expDate);
        const year = d.getFullYear();
        const month = d.getMonth(); // 0-indexed
        // Determine last day of this month
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        const effectiveLastDay = lastDayOfMonth >= 30 ? 30 : lastDayOfMonth;

        salaryMonth = `${year}-${String(month + 1).padStart(2, '0')}`;

        // Check if salary for this employee already registered for this month
        const existing = queryAll(
          "SELECT id FROM expenses WHERE category = 'salary' AND employeeId = ? AND salaryMonth = ?",
          [employeeId, salaryMonth]
        );
        if (existing.length > 0) {
          return res.status(400).json({
            success: false,
            error: `تم صرف راتب شهر (${salaryMonth}) للموظف (${employeeName}) مسبقاً! يمنع تكرار صرف الراتب للشهر نفسه.`,
          });
        }
      }

      const id = 'exp_' + Date.now();
      const now = new Date().toISOString();

      runSql(
        `INSERT INTO expenses (id, category, amount, date, location, employeeId, employeeName, salaryMonth, notes, createdById, createdByName, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          category,
          numAmount,
          expDate,
          location,
          employeeId || null,
          employeeName || null,
          salaryMonth,
          notes || '',
          userId || 'admin',
          userName || 'المدير',
          now,
        ]
      );

      res.json({ success: true, expenseId: id });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 13. Reports (Strict Separation of Gallery vs Stationery)
  app.get('/api/reports', (req: Request, res: Response) => {
    try {
      const { location, startDate, endDate, sellerId } = req.query;
      // Note: By rule, Gallery and Stationery reports MUST NOT be mixed unless explicitly requested
      let invSql = 'SELECT * FROM invoices WHERE 1=1';
      const invParams: any[] = [];

      if (location && (location === 'gallery' || location === 'stationery')) {
        invSql += ' AND location = ?';
        invParams.push(location);
      }
      if (sellerId) {
        invSql += ' AND sellerId = ?';
        invParams.push(sellerId);
      }
      if (startDate) {
        invSql += ' AND date >= ?';
        invParams.push(startDate);
      }
      if (endDate) {
        invSql += ' AND date <= ?';
        invParams.push(endDate);
      }

      const invoices = queryAll(invSql, invParams);

      let totalSales = 0;
      let totalDiscounts = 0;
      let totalPaid = 0;
      let totalRemaining = 0;
      let totalGrossProfit = 0;
      let totalCOGS = 0;

      for (const inv of invoices) {
        totalSales += inv.total;
        totalDiscounts += inv.totalDiscount;
        totalPaid += inv.paid;
        totalRemaining += inv.remaining;

        const items = queryAll('SELECT * FROM invoice_items WHERE invoiceId = ?', [inv.id]);
        for (const it of items) {
          totalGrossProfit += it.itemProfit;
          totalCOGS += it.frozenPurchaseCost * it.quantity;
        }
      }

      // Expenses query
      let expSql = 'SELECT * FROM expenses WHERE 1=1';
      const expParams: any[] = [];
      if (location && (location === 'gallery' || location === 'stationery')) {
        expSql += ' AND location = ?';
        expParams.push(location);
      }
      if (startDate) {
        expSql += ' AND date >= ?';
        expParams.push(startDate);
      }
      if (endDate) {
        expSql += ' AND date <= ?';
        expParams.push(endDate);
      }

      const expenses = queryAll(expSql, expParams);
      let operationalExpenses = 0;
      let salariesExpenses = 0;
      let scrapExpenses = 0;

      for (const exp of expenses) {
        if (exp.category === 'operational') operationalExpenses += exp.amount;
        else if (exp.category === 'salary') salariesExpenses += exp.amount;
        else if (exp.category === 'scrap') scrapExpenses += exp.amount;
      }

      // Inventory valuation at cost
      let prodSql = 'SELECT * FROM products WHERE 1=1';
      const prodParams: any[] = [];
      if (location && (location === 'gallery' || location === 'stationery')) {
        prodSql += ' AND location = ?';
        prodParams.push(location);
      }
      const products = queryAll(prodSql, prodParams);
      let inventoryValuation = 0;
      for (const p of products) {
        inventoryValuation += p.quantity * p.purchaseCost;
      }

      // Net profit = Gross profit from sales - Operational expenses - Salaries - Scrap
      const netProfit = totalGrossProfit - operationalExpenses - salariesExpenses - scrapExpenses;

      // Installments summary
      let instSql = 'SELECT * FROM installments WHERE 1=1';
      const instParams: any[] = [];
      if (location && (location === 'gallery' || location === 'stationery')) {
        instSql += ' AND location = ?';
        instParams.push(location);
      }
      const installments = queryAll(instSql, instParams);
      const totalInstallmentSales = installments.reduce((acc, i) => acc + i.totalAmount, 0);
      const totalInstallmentRemaining = installments.reduce((acc, i) => acc + i.remainingAmount, 0);
      const overdueInstallmentsCount = installments.filter(i => i.status === 'active' && i.dueDate < new Date().toISOString().split('T')[0]).length;

      // Employee performance breakdown (strictly shows true seller names, never replacing with admin)
      const sellerStatsMap: { [key: string]: { sellerName: string; sellerCode: string; count: number; totalSales: number; profit: number } } = {};
      for (const inv of invoices) {
        if (!sellerStatsMap[inv.sellerId]) {
          sellerStatsMap[inv.sellerId] = {
            sellerName: inv.sellerName,
            sellerCode: inv.sellerCode,
            count: 0,
            totalSales: 0,
            profit: 0,
          };
        }
        sellerStatsMap[inv.sellerId].count += 1;
        sellerStatsMap[inv.sellerId].totalSales += inv.total;

        const items = queryAll('SELECT itemProfit FROM invoice_items WHERE invoiceId = ?', [inv.id]);
        for (const it of items) {
          sellerStatsMap[inv.sellerId].profit += it.itemProfit;
        }
      }

      res.json({
        success: true,
        metrics: {
          totalSales,
          totalCOGS,
          totalDiscounts,
          totalPaid,
          totalRemaining,
          totalGrossProfit,
          operationalExpenses,
          salariesExpenses,
          scrapExpenses,
          totalExpenses: operationalExpenses + salariesExpenses + scrapExpenses,
          netProfit,
          inventoryValuation,
          invoiceCount: invoices.length,
          totalInstallmentSales,
          totalInstallmentRemaining,
          overdueInstallmentsCount,
        },
        sellers: Object.values(sellerStatsMap),
        invoices,
        expenses,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 14. Backup & Restore (Handles SQLite format 3 verification & solves Windows WAL EPERM lock)
  app.get('/api/backup/download', (req: Request, res: Response) => {
    try {
      const backup = createBackup();
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.send(backup.buffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/backup/restore', async (req: Request, res: Response) => {
    try {
      const { fileBase64 } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ success: false, error: 'لم يتم إرسال ملف النسخة الاحتياطية' });
      }
      const buffer = Buffer.from(fileBase64, 'base64');
      const result = await verifyAndRestoreBackup(buffer);

      if (result.success) {
        const freshDb = await getDb();
        (global as any).__hawr_db = freshDb;
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/system/reset', (req: Request, res: Response) => {
    try {
      const { password } = req.body;
      const admins = queryAll("SELECT * FROM users WHERE role = 'admin'");
      if (admins.length > 0) {
        if (!password || !verifyPassword(password, admins[0].passwordHash, admins[0].salt)) {
          return res.status(401).json({ success: false, error: 'كلمة مرور المدير مطلوبة لتأكيد إعادة الضبط' });
        }
      }

      const result = resetDatabase();
      getDb().then(freshDb => {
        (global as any).__hawr_db = freshDb;
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 15. Audit Logs
  app.get('/api/audit-logs', (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = queryAll(
        'SELECT id, type as action, userId, username as userName, details, timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT ?',
        [limit]
      );
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`نظام معرض حور يعمل بنجاح على المنفذ ${PORT}`);
  });
}

startServer();
