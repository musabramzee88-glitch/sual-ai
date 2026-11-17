/** زرع البيانات المرجعية — آمن للتشغيل أكثر من مرة (idempotent). */
import { PrismaClient } from "@prisma/client";
import { BRANCHES, GOVERNORATES, STAGES, SUBJECTS, TRACKS, directoratesFor } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  const gradeIds = new Map<string, string>();

  for (const [si, s] of STAGES.entries()) {
    const stage = await prisma.educationStage.upsert({
      where: { code: s.code },
      update: { nameAr: s.nameAr, nameEn: s.nameEn, sortOrder: si },
      create: { code: s.code, nameAr: s.nameAr, nameEn: s.nameEn, sortOrder: si },
    });
    for (const [gi, [code, nameAr, nameEn]] of s.grades.entries()) {
      const grade = await prisma.grade.upsert({
        where: { code },
        update: { nameAr, nameEn, sortOrder: gi, stageId: stage.id },
        create: { code, nameAr, nameEn, sortOrder: gi, stageId: stage.id },
      });
      gradeIds.set(code, grade.id);
    }
  }

  for (const [i, t] of TRACKS.entries()) {
    const { grades, ...data } = t;
    const track = await prisma.curriculumTrack.upsert({
      where: { code: t.code },
      update: { ...data, sortOrder: i },
      create: { ...data, sortOrder: i },
    });
    await prisma.trackGrade.createMany({
      data: grades.map((g) => ({ trackId: track.id, gradeId: gradeIds.get(g)! })),
      skipDuplicates: true,
    });
  }

  for (const [i, b] of BRANCHES.entries()) {
    const { grades, ...data } = b;
    const branch = await prisma.studyBranch.upsert({
      where: { code: b.code },
      update: { ...data, sortOrder: i },
      create: { ...data, sortOrder: i },
    });
    await prisma.gradeBranch.createMany({
      data: grades.map((g) => ({ branchId: branch.id, gradeId: gradeIds.get(g)! })),
      skipDuplicates: true,
    });
  }

  for (const [i, s] of SUBJECTS.entries()) {
    await prisma.subject.upsert({
      where: { code: s.code },
      update: { ...s, sortOrder: i },
      create: { ...s, sortOrder: i },
    });
  }

  for (const [i, g] of GOVERNORATES.entries()) {
    const gov = await prisma.governorate.upsert({
      where: { code: g.code },
      update: { nameAr: g.nameAr, nameEn: g.nameEn, sortOrder: i },
      create: { code: g.code, nameAr: g.nameAr, nameEn: g.nameEn, sortOrder: i },
    });
    for (const [di, [code, nameAr, nameEn]] of directoratesFor(g).entries()) {
      await prisma.educationDirectorate.upsert({
        where: { code },
        update: { nameAr, nameEn, sortOrder: di, governorateId: gov.id },
        create: { code, nameAr, nameEn, sortOrder: di, governorateId: gov.id },
      });
    }
  }

  const counts = await Promise.all([
    prisma.educationStage.count(),
    prisma.grade.count(),
    prisma.curriculumTrack.count(),
    prisma.studyBranch.count(),
    prisma.subject.count(),
    prisma.governorate.count(),
    prisma.educationDirectorate.count(),
  ]);
  console.log("Seeded: stages=%d grades=%d tracks=%d branches=%d subjects=%d governorates=%d directorates=%d", ...counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
