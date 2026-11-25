import {
  PrismaClient,
  Role,
  ControlType,
  SubmissionStatus,
  KpiBlock,
  KpiStatus,
  NotificationType,
  IssueSeverity,
  IssueSource,
  IssueStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildIssueFingerprint } from "../src/lib/monitoring";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Kafedra Portal database...");

  const passwordHash = await bcrypt.hash("Kafedra2026!", 10);

  // 1. Department
  const department = await prisma.department.upsert({
    where: { code: "SE-KAF" },
    update: {},
    create: {
      name: "Dasturiy injiniring va raqamli texnologiyalar kafedrasi",
      code: "SE-KAF",
      faculty: "Axborot texnologiyalari fakulteti",
      headName: "prof. Abdullayev Rustamjon Karimovich",
    },
  });

  // 2. Academic Groups
  const groupAT = await prisma.academicGroup.upsert({
    where: { name: "AT-301" },
    update: {},
    create: {
      name: "AT-301",
      courseYear: 3,
      semester: 5,
      specialty: "60610600 - Dasturiy injiniring",
      departmentId: department.id,
    },
  });

  const groupDI = await prisma.academicGroup.upsert({
    where: { name: "DI-202" },
    update: {},
    create: {
      name: "DI-202",
      courseYear: 2,
      semester: 3,
      specialty: "60610500 - Kompyuter injiniringi",
      departmentId: department.id,
    },
  });

  // 3. Users (Admin, Dean, Teachers, Students)
  const admin = await prisma.user.upsert({
    where: { email: "admin@kafedra.uz" },
    update: {},
    create: {
      email: "admin@kafedra.uz",
      passwordHash,
      fullName: "Xolmatov Azizbek Shukhratovich",
      role: Role.ADMIN,
      academicTitle: "Tizim administratori (DevOps / IT)",
      phone: "+998 90 100 00 00",
      departmentId: department.id,
    },
  });

  const dean = await prisma.user.upsert({
    where: { email: "dekanat@kafedra.uz" },
    update: {},
    create: {
      email: "dekanat@kafedra.uz",
      passwordHash,
      fullName: "Abdullayev Rustamjon Karimovich",
      role: Role.DEAN,
      academicTitle: "Professor, DSc — Kafedra mudiri",
      phone: "+998 90 100 00 01",
      departmentId: department.id,
    },
  });

  const teacher1 = await prisma.user.upsert({
    where: { email: "karimova@kafedra.uz" },
    update: {},
    create: {
      email: "karimova@kafedra.uz",
      passwordHash,
      fullName: "Karimova Dilnoza Baxtiyorovna",
      role: Role.TEACHER,
      academicTitle: "Dotsent, PhD",
      phone: "+998 90 200 11 22",
      departmentId: department.id,
    },
  });

  const teacher2 = await prisma.user.upsert({
    where: { email: "tursunov@kafedra.uz" },
    update: {},
    create: {
      email: "tursunov@kafedra.uz",
      passwordHash,
      fullName: "Tursunov Sardorbek Alisherovich",
      role: Role.TEACHER,
      academicTitle: "Katta o'qituvchi",
      phone: "+998 90 200 33 44",
      departmentId: department.id,
    },
  });

  const teacher3 = await prisma.user.upsert({
    where: { email: "nazarov@kafedra.uz" },
    update: {},
    create: {
      email: "nazarov@kafedra.uz",
      passwordHash,
      fullName: "Nazarov Bekzod Farhodovich",
      role: Role.TEACHER,
      academicTitle: "Assistent",
      phone: "+998 90 200 55 66",
      departmentId: department.id,
    },
  });

  const studentsData = [
    { email: "ali@student.uz", fullName: "Valiyev Alisher Odilovich", groupId: groupAT.id, title: "3-kurs talabasi (AT-301)" },
    { email: "madina@student.uz", fullName: "Rahimova Madina Jasurovna", groupId: groupAT.id, title: "3-kurs talabasi (AT-301)" },
    { email: "jasur@student.uz", fullName: "Qodirov Jasurbek Shavkatovich", groupId: groupAT.id, title: "3-kurs talabasi (AT-301)" },
    { email: "sevara@student.uz", fullName: "Ismoilova Sevara Akmalovna", groupId: groupDI.id, title: "2-kurs talabasi (DI-202)" },
    { email: "bobur@student.uz", fullName: "Sattorov Boburmirzo Ilhomovich", groupId: groupDI.id, title: "2-kurs talabasi (DI-202)" },
  ];

  const students = [];
  for (const s of studentsData) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        passwordHash,
        fullName: s.fullName,
        role: Role.STUDENT,
        academicTitle: s.title,
        departmentId: department.id,
        groupId: s.groupId,
      },
    });
    students.push(user);
  }

  // 4. Subjects
  const subjWeb = await prisma.subject.upsert({
    where: { code: "DI-305" },
    update: {},
    create: {
      name: "Web-ilovalarni loyihalash va arxitektura",
      code: "DI-305",
      credits: 6,
      semester: 5,
      departmentId: department.id,
    },
  });

  const subjDB = await prisma.subject.upsert({
    where: { code: "DI-308" },
    update: {},
    create: {
      name: "Ma'lumotlar bazasini boshqarish tizimlari",
      code: "DI-308",
      credits: 6,
      semester: 5,
      departmentId: department.id,
    },
  });

  const subjAlgo = await prisma.subject.upsert({
    where: { code: "KI-204" },
    update: {},
    create: {
      name: "Algoritmlar va ma'lumotlar tuzilmasi",
      code: "KI-204",
      credits: 5,
      semester: 3,
      departmentId: department.id,
    },
  });

  // 5. SubjectTeacher assignments
  const teachings = [
    { subjectId: subjWeb.id, teacherId: teacher1.id, groupId: groupAT.id },
    { subjectId: subjDB.id, teacherId: teacher2.id, groupId: groupAT.id },
    { subjectId: subjAlgo.id, teacherId: teacher2.id, groupId: groupDI.id },
    { subjectId: subjAlgo.id, teacherId: teacher3.id, groupId: groupDI.id },
  ];

  for (const t of teachings) {
    await prisma.subjectTeacher.upsert({
      where: {
        subjectId_teacherId_groupId: t,
      },
      update: {},
      create: t,
    });
  }

  // 6. Standard Uzbek University KPI Criteria
  const criteriaData = [
    {
      code: "SCI-SCOPUS",
      title: "Scopus / Web of Science bazasidagi maqola",
      block: KpiBlock.SCIENTIFIC,
      pointsPerUnit: 20,
      maxPoints: 60,
      description: "Q1-Q4 kvartildagi xalqaro ilmiy jurnallarda chop etilgan maqola (DOI va jurnal havolasi talab etiladi).",
    },
    {
      code: "SCI-OAK",
      title: "OAK ro'yxatidagi respublika ilmiy jurnali maqolasi",
      block: KpiBlock.SCIENTIFIC,
      pointsPerUnit: 10,
      maxPoints: 30,
      description: "O'zbekiston Respublikasi OAK e'tirof etgan jurnallarda chop etilgan maqola.",
    },
    {
      code: "SCI-CONF",
      title: "Xalqaro yoki respublika konferensiya tezisi",
      block: KpiBlock.SCIENTIFIC,
      pointsPerUnit: 4,
      maxPoints: 16,
      description: "Ilmiy-amaliy konferensiya to'plamida nashr etilgan maqola yoki tezis.",
    },
    {
      code: "MET-TEXTBOOK",
      title: "Darslik yoki o'quv qo'llanma nashri",
      block: KpiBlock.METHODICAL,
      pointsPerUnit: 15,
      maxPoints: 30,
      description: "Oliy ta'lim vazirligi grifi yoki Kengash qarori bilan chop etilgan darslik/o'quv qo'llanma.",
    },
    {
      code: "MET-GUIDE",
      title: "Uslubiy ko'rsatma va laboratoriya majmuasi",
      block: KpiBlock.METHODICAL,
      pointsPerUnit: 6,
      maxPoints: 18,
      description: "Fan bo'yicha tasdiqlangan elektron o'quv-uslubiy majmua (O'UM) yoki laboratoriya qo'llanmasi.",
    },
    {
      code: "INN-DGU",
      title: "Dasturiy mahsulot guvohnomasi (DGU) yoki patent",
      block: KpiBlock.INNOVATION,
      pointsPerUnit: 12,
      maxPoints: 36,
      description: "Intellektual mulk agentligi tomonidan berilgan rasmiy DGU guvohnomasi yoki ixtiro patenti.",
    },
    {
      code: "INN-GRANT",
      title: "Ilmiy grant yoki xo'jalik shartnomasi",
      block: KpiBlock.INNOVATION,
      pointsPerUnit: 15,
      maxPoints: 30,
      description: "Davlat ilmiy-texnik dasturlari, xalqaro grantlar yoki xo'jalik shartnomalarida ishtirok.",
    },
    {
      code: "QUA-OPEN-CLASS",
      title: "Ochiq dars o'tkazish va kafedra muhokamasi",
      block: KpiBlock.QUALITY,
      pointsPerUnit: 5,
      maxPoints: 15,
      description: "Kafedra bayonnomasi bilan tasdiqlangan namunaviy ochiq ma'ruza yoki amaliy mashg'ulot.",
    },
    {
      code: "QUA-OLYMPIAD",
      title: "Talabalarni olimpiada va tanlovlarga tayyorlash",
      block: KpiBlock.QUALITY,
      pointsPerUnit: 8,
      maxPoints: 24,
      description: "Respublika/xalqaro fan olimpiadasi yoki xakatonda sovrindor bo'lgan talabalarga ilmiy rahbarlik.",
    },
  ];

  const criteriaMap: Record<string, string> = {};
  for (const c of criteriaData) {
    const crit = await prisma.kpiCriterion.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
    criteriaMap[c.code] = crit.id;
  }

  // Seed assignments only if empty so re-running seed is idempotent
  const existingAssignments = await prisma.assignment.count();
  if (existingAssignments === 0) {
    const now = new Date();
    const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const a1 = await prisma.assignment.create({
      data: {
        title: "1-amaliy ish: REST API va autentifikatsiya arxitekturasi",
        description:
          "Next.js Route Handlers yordamida JWT asosida kirish va RBAC himoyasini loyihalang. GitHub havolasi va arxitektura diagrammasini (PDF) yuklang.",
        controlType: ControlType.LAB,
        maxScore: 20,
        dueDate: inFiveDays,
        allowLate: true,
        latePenaltyPct: 10,
        subjectId: subjWeb.id,
        groupId: groupAT.id,
        teacherId: teacher1.id,
      },
    });

    const a2 = await prisma.assignment.create({
      data: {
        title: "Oraliq nazorat #1: Relatsion ma'lumotlar bazasini normallashtirish",
        description:
          "Kafedra axborot tizimi uchun 3NF darajasigacha normallashtirilgan ER-diagramma va SQL skriptlarini PDF/ZIP formatida topshiring.",
        controlType: ControlType.ORALIQ,
        maxScore: 30,
        dueDate: twoDaysAgo,
        allowLate: true,
        latePenaltyPct: 15,
        subjectId: subjDB.id,
        groupId: groupAT.id,
        teacherId: teacher2.id,
      },
    });

    await prisma.assignment.create({
      data: {
        title: "Mustaqil ta'lim: Graf algoritmlari (Dijkstra va BFS) tahlili",
        description:
          "Dijkstra va BFS algoritmlarining vaqt murakkabligini solishtiring va kamida 3 ta test misoli bilan kodni ilova qiling.",
        controlType: ControlType.MUSTAQIL,
        maxScore: 20,
        dueDate: inTenDays,
        allowLate: false,
        latePenaltyPct: 0,
        subjectId: subjAlgo.id,
        groupId: groupDI.id,
        teacherId: teacher2.id,
      },
    });

    // Submissions for AT-301 students
    const sub1 = await prisma.submission.create({
      data: {
        assignmentId: a1.id,
        studentId: students[0].id, // Alisher
        version: 1,
        comment: "REST API endpointlar va RBAC tekshiruvlari tayyorlandi, GitHub repository ilova qilindi.",
        externalUrl: "https://github.com/alisher-dev/kafedra-api-lab1",
        status: SubmissionStatus.GRADED,
        score: 18.5,
        feedback: "Arxitektura juda yaxshi tuzilgan, faqat refresh token rotatsiyasini ham qo'shish tavsiya etiladi.",
        gradedById: teacher1.id,
        submittedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        gradedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
    });
    await prisma.submissionVersion.create({
      data: {
        submissionId: sub1.id,
        version: 1,
        comment: sub1.comment,
        externalUrl: sub1.externalUrl,
      },
    });

    const sub2 = await prisma.submission.create({
      data: {
        assignmentId: a1.id,
        studentId: students[1].id, // Madina
        version: 1,
        comment: "Barcha endpointlar Swagger hujjati bilan birga topshirildi.",
        externalUrl: "https://github.com/madina-dev/web-arch-lab1",
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      },
    });
    await prisma.submissionVersion.create({
      data: {
        submissionId: sub2.id,
        version: 1,
        comment: sub2.comment,
        externalUrl: sub2.externalUrl,
      },
    });

    const sub3 = await prisma.submission.create({
      data: {
        assignmentId: a2.id,
        studentId: students[0].id, // Alisher
        version: 1,
        comment: "ER diagramma va PostgreSQL migratsiya skriptlari yuklandi.",
        externalUrl: "https://github.com/alisher-dev/db-normalization-3nf",
        status: SubmissionStatus.GRADED,
        score: 27,
        feedback: "3NF normallashtirish to'g'ri bajarilgan, indekslar o'rinli qo'yilgan.",
        gradedById: teacher2.id,
        submittedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        gradedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.submissionVersion.create({
      data: {
        submissionId: sub3.id,
        version: 1,
        comment: sub3.comment,
        externalUrl: sub3.externalUrl,
      },
    });

    // Seed Teacher KPI Entries
    const kpi1 = await prisma.kpiEntry.create({
      data: {
        teacherId: teacher1.id,
        criterionId: criteriaMap["SCI-SCOPUS"],
        academicYear: "2026-2027",
        semester: "Kuzgi",
        title: "Adaptive Learning Analytics in University Departments using ML",
        description: "Scopus Q2 jurnalida chop etilgan ilmiy maqola (hammualliflikda).",
        quantity: 1,
        calculatedScore: 20,
        approvedScore: 20,
        proofUrl: "https://doi.org/10.1000/kafedra-scopus-2026",
        status: KpiStatus.APPROVED,
        reviewComment: "DOI tasdiqlandi, maqola kafedra profiliga to'liq mos.",
        reviewedById: dean.id,
        submittedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        reviewedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const kpi2 = await prisma.kpiEntry.create({
      data: {
        teacherId: teacher1.id,
        criterionId: criteriaMap["MET-TEXTBOOK"],
        academicYear: "2026-2027",
        semester: "Kuzgi",
        title: "Zamonaviy Web-arxitektura va TypeScript (O'quv qo'llanma)",
        description: "Universitet ilmiy-uslubiy kengashi qarori bilan tasdiqlangan.",
        quantity: 1,
        calculatedScore: 15,
        proofUrl: "https://library.kafedra.uz/books/web-arch-2026",
        status: KpiStatus.PENDING,
        submittedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.kpiEntry.create({
      data: {
        teacherId: teacher2.id,
        criterionId: criteriaMap["INN-DGU"],
        academicYear: "2026-2027",
        semester: "Kuzgi",
        title: "DGU № 45120 — Talabalar davomati va baholash tahlil tizimi",
        description: "Intellektual mulk agentligi guvohnomasi.",
        quantity: 1,
        calculatedScore: 12,
        approvedScore: 12,
        proofUrl: "https://ima.uz/dgu/45120",
        status: KpiStatus.APPROVED,
        reviewComment: "Rasmiy guvohnoma raqami tekshirildi va tasdiqlandi.",
        reviewedById: dean.id,
        submittedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
        reviewedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.kpiEntry.create({
      data: {
        teacherId: teacher2.id,
        criterionId: criteriaMap["QUA-OLYMPIAD"],
        academicYear: "2026-2027",
        semester: "Kuzgi",
        title: "ICPC Markaziy Osiyo mintaqaviy bosqichi jamoasi rahbarligi",
        description: "AT-301 guruhi talabalari yarim final yo'llanmasini qo'lga kiritdi.",
        quantity: 1,
        calculatedScore: 8,
        proofUrl: "https://icpc.global/regionals/central-asia-2026",
        status: KpiStatus.PENDING,
        submittedAt: new Date(now.getTime() - 8 * 60 * 60 * 1000),
      },
    });

    await prisma.kpiEntry.create({
      data: {
        teacherId: teacher3.id,
        criterionId: criteriaMap["SCI-OAK"],
        academicYear: "2026-2027",
        semester: "Kuzgi",
        title: "Graf algoritmlarini parallel hisoblash muhitida optimallashtirish",
        description: "TATU xabarlari jurnalida nashr uchun yuborilgan.",
        quantity: 1,
        calculatedScore: 10,
        proofUrl: "https://journal.tuit.uz/article-2026",
        status: KpiStatus.REJECTED,
        reviewComment: "Jurnal nashr etilgan PDF nusxasi yoki DOI hali ilova qilinmagan. Qabul xati yetarli emas.",
        reviewedById: dean.id,
        submittedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
        reviewedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
    });

    // Notifications
    await prisma.notification.createMany({
      data: [
        {
          userId: dean.id,
          type: NotificationType.KPI_SUBMITTED,
          title: "Yangi KPI tasdiqlash kutilmoqda",
          message: `${teacher1.fullName} "${kpi2.title}" bo'yicha 15 ballik KPI arizasi yubordi.`,
          link: "/dean?tab=kpi",
        },
        {
          userId: teacher1.id,
          type: NotificationType.SUBMISSION_RECEIVED,
          title: "Yangi topshiriq kelib tushdi",
          message: `${students[1].fullName} "${a1.title}" vazifasini topshirdi.`,
          link: "/teacher?tab=grading",
        },
        {
          userId: students[0].id,
          type: NotificationType.SUBMISSION_GRADED,
          title: "Vazifangiz baholandi",
          message: `"${a1.title}" bo'yicha 18.5 / 20 ball qo'yildi.`,
          link: "/student?tab=grades",
        },
      ],
    });

    // Audit Logs
    await prisma.auditLog.createMany({
      data: [
        {
          actorId: dean.id,
          action: "KPI_APPROVED",
          entityType: "KpiEntry",
          entityId: kpi1.id,
          oldValue: JSON.stringify({ status: "PENDING", approvedScore: null }),
          newValue: JSON.stringify({ status: "APPROVED", approvedScore: 20 }),
          reason: "DOI tasdiqlandi, maqola kafedra profiliga to'liq mos.",
        },
        {
          actorId: teacher1.id,
          action: "SUBMISSION_GRADED",
          entityType: "Submission",
          entityId: sub1.id,
          oldValue: JSON.stringify({ status: "SUBMITTED", score: null }),
          newValue: JSON.stringify({ status: "GRADED", score: 18.5 }),
          reason: "Amaliy ish mezonlari bo'yicha baholandi.",
        },
      ],
    });
  }

  // System Issues (idempotent seed if table is empty)
  const existingIssues = await prisma.systemIssue.count();
  if (existingIssues === 0) {
    const now = new Date();
    await prisma.systemIssue.createMany({
      data: [
        {
          title: "Fayl yuklash hajmi chegarasidan oshgan urinish",
          message: "Talaba 25 MB hajmdagi ZIP arxiv yuklashga urindi (maksimal chegara: 20 MB).",
          severity: IssueSeverity.WARNING,
          source: IssueSource.API_SERVER,
          status: IssueStatus.OPEN,
          route: "/api/student/submissions",
          method: "POST",
          statusCode: 400,
          fingerprint: buildIssueFingerprint({
            source: IssueSource.API_SERVER,
            route: "/api/student/submissions",
            method: "POST",
            title: "Fayl yuklash hajmi chegarasidan oshgan urinish",
          }),
          occurrenceCount: 3,
          lastOccurredAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
          reportedByUserId: students[0]?.id ?? null,
        },
        {
          title: "Kafedra KPI CSV eksport so'rovi sekinlashuvi",
          message: "KPI hisoboti generatsiya vaqti 1200 ms dan oshdi; indeksatsiya tekshiruvi tavsiya etiladi.",
          severity: IssueSeverity.INFO,
          source: IssueSource.DATABASE,
          status: IssueStatus.ACKNOWLEDGED,
          route: "/api/dean/reports/kpi-csv",
          method: "GET",
          statusCode: 200,
          fingerprint: buildIssueFingerprint({
            source: IssueSource.DATABASE,
            route: "/api/dean/reports/kpi-csv",
            method: "GET",
            title: "Kafedra KPI CSV eksport so'rovi sekinlashuvi",
          }),
          occurrenceCount: 1,
          lastOccurredAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
        },
        {
          title: "JWT sessiya kaliti standart dev rejimda",
          message: "Production muhitga chiqarishdan oldin AUTH_SECRET ni kuchli tasodifiy qiymatga almashtiring.",
          severity: IssueSeverity.WARNING,
          source: IssueSource.AUTH,
          status: IssueStatus.OPEN,
          route: "/api/auth/login",
          method: "POST",
          statusCode: 200,
          fingerprint: buildIssueFingerprint({
            source: IssueSource.AUTH,
            route: "/api/auth/login",
            method: "POST",
            title: "JWT sessiya kaliti standart dev rejimda",
          }),
          occurrenceCount: 1,
          lastOccurredAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      ],
    });

    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: NotificationType.SYSTEM_ALERT,
        title: "Tizim monitoringi faollashtirildi",
        message: "Administrator panelida 2 ta ochiq va 1 ta ko'rib chiqilayotgan ogohlantirish mavjud.",
        link: "/admin?tab=issues",
      },
    });
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
