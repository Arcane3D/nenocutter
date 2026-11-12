import type { Design } from '../domain/types';
import { jsPDF } from 'jspdf';
import { boundsOf } from '../geometry/path';

/** 1:1 outline template. Print with scaling set to 100% / actual size. */
export function encodePDF(design: Design): Uint8Array {
  const paths = design.paths.filter((path) => path.points.length >= 2);
  const box = boundsOf(paths);
  const margin = 14;
  const note = 12;
  const pageW = Math.max(40, box.width + margin * 2);
  const pageH = Math.max(40, box.height + margin * 2 + note);
  const pdf = new jsPDF({
    unit: 'mm',
    format: [pageW, pageH],
    orientation: pageW > pageH ? 'landscape' : 'portrait',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(60, 42, 34);
  pdf.text('Nenocutter outline  ·  print at 100% scale', margin, 8);
  pdf.setFontSize(8);
  pdf.text(`${box.width.toFixed(1)} × ${box.height.toFixed(1)} mm`, margin, 13);
  pdf.setDrawColor(90, 60, 40);
  pdf.setLineWidth(0.2);
  for (const path of paths) {
    if (path.role === 'hole') pdf.setDrawColor(160, 120, 90);
    else pdf.setDrawColor(70, 48, 36);
    const start = path.points[0];
    const commands: [number, number][] = path.points.slice(1).map((point) => [
      margin + (point.x - box.minX),
      margin + note + (box.maxY - point.y),
    ]);
    pdf.moveTo(margin + (start.x - box.minX), margin + note + (box.maxY - start.y));
    for (const [x, y] of commands) pdf.lineTo(x, y);
    if (path.closed) pdf.close();
    pdf.stroke();
  }
  pdf.setDrawColor(196, 140, 80);
  pdf.setLineWidth(0.4);
  const barY = pageH - 6;
  pdf.line(margin, barY, margin + 10, barY);
  pdf.setFontSize(8);
  pdf.text('10 mm', margin + 12, barY + 1);
  return new Uint8Array(pdf.output('arraybuffer'));
}
