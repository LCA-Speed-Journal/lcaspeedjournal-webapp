import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

export async function downloadPreviewPdf(
  node: HTMLElement,
  filename: string
): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "in",
    format: "letter",
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, 11, 8.5);
  pdf.save(filename);
}
