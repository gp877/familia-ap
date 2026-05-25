import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { exames, exameResultados, users } from "@/db/schema";
import { extractExameFromPdf } from "@/lib/exame-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!dbUser?.householdId) {
    return NextResponse.json({ error: "Sem household" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Apenas PDF é aceito" }, { status: 400 });
  }

  const whoOverride = ((formData.get("who") as string) || "").trim();
  const dateOverride = ((formData.get("examDate") as string) || "").trim();

  const buf = Buffer.from(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractExameFromPdf(buf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Falha na extração: ${msg}` }, { status: 500 });
  }

  const who = whoOverride || extracted.who?.trim() || "Não identificado";
  const examDate =
    dateOverride ||
    extracted.examDate ||
    new Date().toISOString().slice(0, 10);

  const name =
    extracted.examName?.trim() ||
    (extracted.markers.length === 1
      ? extracted.markers[0].markerLabel
      : `Exame ${examDate}`);

  const doctor = extracted.lab?.trim() || extracted.doctor?.trim() || null;

  // Status map: o extractor usa "atencao", já bate com nosso enum
  const status = extracted.status ?? "ok";

  const [novoExame] = await db
    .insert(exames)
    .values({
      householdId: dbUser.householdId,
      createdById: dbUser.id,
      who,
      name,
      examDate,
      doctor,
      status,
    })
    .returning();

  if (extracted.markers.length > 0) {
    await db.insert(exameResultados).values(
      extracted.markers.map((m) => ({
        exameId: novoExame.id,
        householdId: dbUser.householdId!,
        who,
        examDate,
        marker: m.marker.toLowerCase().replace(/\s+/g, "_"),
        markerLabel: m.markerLabel,
        value: m.value !== null ? String(m.value) : null,
        valueText: m.valueText,
        unit: m.unit,
        refMin: m.refMin !== null ? String(m.refMin) : null,
        refMax: m.refMax !== null ? String(m.refMax) : null,
        refText: m.refText,
        flag: m.flag,
      }))
    );
  }

  return NextResponse.json({
    ok: true,
    exameId: novoExame.id,
    who,
    examDate,
    name,
    markerCount: extracted.markers.length,
  });
}
