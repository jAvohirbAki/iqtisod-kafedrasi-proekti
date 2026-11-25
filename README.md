# Kafedra LMS & KPI Platformasi

Oliy ta'lim muassasalari (OTM) kafedralari uchun **o'quv vazifalarini topshirish, baholash va o'qituvchilar KPI ko'rsatkichlarini boshqarish** tizimi.

## Asosiy imkoniyatlar (3 ta mustaqil panel)

1. **Dekanat / Kafedra mudiri paneli (`/dean`)**
   - O'qituvchilar KPI reytingi (Ilmiy-tadqiqot, O'quv-uslubiy, Innovatsiya va grantlar, Sifat bloklari kesimida)
   - KPI arizalarini tekshirish: tasdiqlovchi fayl/DOI ni ko'rish, ballni tasdiqlash yoki izoh bilan rad etish
   - Excel (UTF-8 CSV) formatida kafedra KPI hisobotini yuklab olish
   - Akademik guruhlar, fanlar, o'qituvchi-fan biriktirishlari va foydalanuvchilarni boshqarish
   - KPI mezonlarini sozlash va barcha o'zgarishlar bo'yicha to'liq **Audit Log**

2. **O'qituvchi paneli (`/teacher`)**
   - Fan va guruh bo'yicha vazifalar qo'yish (Joriy, Oraliq, Lab, Mustaqil ta'lim; deadline, kechikish jarimasi, metodik fayl)
   - Talabalar topshirgan ishlarni baholash yoki qayta ishlashga qaytarish
   - Shaxsiy KPI ma'lumotlarini kiritish (Scopus, OAK, Darslik, DGU/Patent, Grant, Ochiq dars, Olimpiada), tasdiqlovchi hujjat yuklash va holatini kuzatish

3. **Talaba paneli (`/student`)**
   - Biriktirilgan fanlar bo'yicha vazifalar ro'yxati va muddat nazorati
   - Fayl (PDF, DOCX, ZIP, rasm) va GitHub/Drive havolasi yuklash (`v1`, `v2` versiyalar tarixi bilan)
   - O'qituvchi izohi va 100 ballik kredit-modul tizimidagi reyting daftarchasi (`5`, `4`, `3`, `2`)

## Texnologik stek

- **Frontend / Backend**: Next.js 16 (App Router, TypeScript), Tailwind CSS v4
- **Ma'lumotlar bazasi**: PostgreSQL + Prisma ORM
- **Xavfsizlik**: `bcryptjs`, JWT (`jose` HttpOnly cookie), RBAC (`src/proxy.ts` + API darajasida tekshiruv), Audit Log

## Loyihani ishga tushirish

```bash
# 1. Paketlarni o'rnatish
npm install

# 2. Muhit o'zgaruvchilarini sozlash
cp .env.example .env

# 3. Lokal PostgreSQL serverni ishga tushirish (Docker bo'lmasa Prisma Dev orqali)
npx prisma dev -d -n kafedra
# Prisma chiqargan postgres:// DATABASE_URL qiymatini .env fayliga yozing.
# Lokal Prisma Dev uchun localhost o'rniga 127.0.0.1 ishlating.
# Ulanish parametrlarini pgbouncer=true, connection_limit=1,
# connect_timeout=5 va pool_timeout=10 qilib sozlang.
# Avval yaratilgan baza to'xtagan bo'lsa, uni qayta ishga tushiring:
# npx prisma dev start kafedra
# Yoki Docker bilan:
# docker compose up -d

# 4. Baza jadvallarini yaratish va boshlang'ich demo ma'lumotlarni yuklash
npm run db:push
npm run db:seed

# 5. Portalni mahalliy ishlatish
npm run build
npm start -- --hostname 127.0.0.1
```

## Demo hisoblar (Parol: `Kafedra2026!`)

| Rol | Email | Imkoniyat |
|---|---|---|
| Dekanat / Kafedra mudiri | `dekanat@kafedra.uz` | KPI tasdiqlash, guruh/fan/foydalanuvchi boshqaruvi |
| O'qituvchi (Dotsent) | `karimova@kafedra.uz` | Vazifa yaratish, baholash, KPI kiritish |
| Talaba (AT-301) | `ali@student.uz` | Vazifa yuklash va baholarni ko'rish |

## GitHub'ga ulash

```bash
git add .
git commit -m "feat: kafedra LMS va KPI platformasi"
git branch -M main
git remote add origin https://github.com/<USERNAME>/<REPO_NAME>.git
git push -u origin main
```
