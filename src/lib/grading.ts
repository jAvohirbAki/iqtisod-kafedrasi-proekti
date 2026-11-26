import type { Prisma, Submission } from "@prisma/client";

export async function preserveLegacyGrade(tx: Prisma.TransactionClient, submission: Submission) {
  if (submission.gradingRevision !== 0 || (submission.status !== "GRADED" && submission.status !== "RETURNED")) return;

  await tx.submissionGrade.createMany({
    data: [{
      submissionId: submission.id,
      submissionVersion: submission.version,
      revision: 0,
      status: submission.status,
      score: submission.score,
      feedback: submission.feedback,
      graderId: submission.gradedById,
      gradedAt: submission.gradedAt ?? submission.updatedAt,
    }],
    skipDuplicates: true,
  });
}
