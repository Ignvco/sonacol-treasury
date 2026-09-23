import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { ExportRow } from "./export";
export interface PdfReport {
  title: string;
  subtitle?: string;
  source?: { id: string; fileName: string; revision: string };
  sections: { title: string; rows: ExportRow[] }[];
  warnings?: string[];
  chart?: { date: string; balance: number }[];
}
const clean = (s: unknown) =>
  String(s ?? "")
    .replace(/[\u2011\u2013\u2014\u2212]/g, "-")
    .replace(/→/g, ">")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "?");
const blue = rgb(0.04, 0.12, 0.64),
  ink = rgb(0.13, 0.18, 0.26),
  muted = rgb(0.4, 0.45, 0.52),
  light = rgb(0.94, 0.96, 0.99);
function fit(font: PDFFont, text: string, size: number, width: number) {
  let s = clean(text);
  while (s.length && font.widthOfTextAtSize(s, size) > width)
    s = s.slice(0, -1);
  return s.length < text.length ? s.slice(0, -3) + "..." : s;
}
export async function createReportPdf(report: PdfReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(clean(report.title));
  doc.setAuthor("SONACOL Treasury");
  const font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage,
    y = 0;
  const pageStart = () => {
    page = doc.addPage([842, 595]);
    page.drawRectangle({ x: 0, y: 523, width: 842, height: 72, color: blue });
    page.drawText("SONACOL / TESORERIA", {
      x: 36,
      y: 564,
      size: 10,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(fit(bold, report.title, 20, 770), {
      x: 36,
      y: 536,
      size: 20,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(fit(font, report.subtitle ?? "", 10, 770), {
      x: 36,
      y: 503,
      size: 10,
      font,
      color: muted,
    });
    y = 481;
  };
  pageStart();
  if (report.source) {
    for (const t of [
      "BASE: " + report.source.fileName,
      "Lote: " + report.source.id + " | Revision: " + report.source.revision,
    ]) {
      page.drawText(fit(font, t, 8, 770), {
        x: 36,
        y,
        size: 8,
        font,
        color: muted,
      });
      y -= 14;
    }
    y -= 8;
  }
  if (report.chart?.length) {
    const data = report.chart,
      low = Math.min(...data.map((d) => d.balance)),
      high = Math.max(...data.map((d) => d.balance)),
      height = 100,
      base = y - height;
    page.drawRectangle({ x: 36, y: base, width: 770, height, color: light });
    const point = (i: number) => ({
      x: 46 + (i * 750) / Math.max(1, data.length - 1),
      y: base + 12 + ((data[i].balance - low) / (high - low || 1)) * 60,
    });
    for (let i = 1; i < data.length; i++)
      page.drawLine({
        start: point(i - 1),
        end: point(i),
        thickness: 2,
        color: blue,
      });
    page.drawText(
      "Saldo proyectado | " + data[0].date + " a " + data[data.length - 1].date,
      { x: 42, y: base + height - 12, size: 8, font, color: ink },
    );
    y = base - 24;
  }
  for (const section of report.sections) {
    if (y < 95) pageStart();
    page.drawText(clean(section.title), {
      x: 36,
      y,
      size: 13,
      font: bold,
      color: blue,
    });
    y -= 24;
    if (!section.rows.length) {
      page.drawText("Sin datos para este contexto.", {
        x: 36,
        y,
        size: 9,
        font,
        color: muted,
      });
      y -= 30;
      continue;
    }
    const headers = Object.keys(section.rows[0]);
    for (let offset = 0; offset < headers.length; offset += 6) {
      const group = headers.slice(offset, offset + 6),
        width = 738 / group.length;
      const header = () => {
        page.drawRectangle({
          x: 36,
          y: y - 5,
          width: 770,
          height: 21,
          color: light,
        });
        page.drawText("#", { x: 40, y, size: 8, font: bold, color: ink });
        group.forEach((h, i) =>
          page.drawText(fit(bold, h, 8, width - 12), {
            x: 68 + i * width,
            y,
            size: 8,
            font: bold,
            color: ink,
          }),
        );
        y -= 24;
      };
      if (y < 80) pageStart();
      header();
      for (const [index, row] of section.rows.entries()) {
        if (y < 54) {
          pageStart();
          page.drawText(clean(section.title) + " (continuación)", {
            x: 36,
            y,
            size: 12,
            font: bold,
            color: blue,
          });
          y -= 24;
          header();
        }
        page.drawText(String(index + 1), {
          x: 40,
          y,
          size: 8,
          font,
          color: muted,
        });
        group.forEach((h, i) => {
          const raw = row[h],
            v =
              typeof raw === "number"
                ? Intl.NumberFormat("es-CL", {
                    maximumFractionDigits: 2,
                  }).format(raw)
                : String(raw);
          page.drawText(fit(font, v, 8, width - 12), {
            x: 68 + i * width,
            y,
            size: 8,
            font,
            color: ink,
          });
        });
        page.drawLine({
          start: { x: 36, y: y - 6 },
          end: { x: 806, y: y - 6 },
          thickness: 0.3,
          color: light,
        });
        y -= 20;
      }
      y -= 16;
    }
  }
  if (report.warnings?.length) {
    if (y < 100) pageStart();
    page.drawText("Observaciones", {
      x: 36,
      y,
      size: 12,
      font: bold,
      color: blue,
    });
    y -= 22;
    for (const warning of report.warnings) {
      let line = "";
      for (const word of clean(warning).split(" ")) {
        if (font.widthOfTextAtSize(line + " " + word, 9) > 760) {
          if (y < 50) pageStart();
          page.drawText(line, { x: 36, y, size: 9, font, color: ink });
          y -= 14;
          line = word;
        } else line += (line ? " " : "") + word;
      }
      if (y < 50) pageStart();
      page.drawText(line, { x: 36, y, size: 9, font, color: ink });
      y -= 20;
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      "Uso interno | Motor decision-v1 | " +
        new Date().toISOString().slice(0, 10),
      { x: 36, y: 22, size: 8, font, color: muted },
    );
    p.drawText(`${i + 1} / ${pages.length}`, {
      x: 760,
      y: 22,
      size: 8,
      font,
      color: muted,
    });
  });
  return doc.save();
}
export async function downloadReportPdf(report: PdfReport, filename: string) {
  const { treasuryRpc } = await import("@/services/decisionService");
  await treasuryRpc("treasury_export_authorize", { p_name: filename + ".pdf" });
  const bytes = await createReportPdf(report);
  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: "application/pdf" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename + ".pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
