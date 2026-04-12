/**
 * Label Print Utility
 *
 * printLabelHtml() — renders the label HTML into an off-screen element,
 * captures it as a high-res PNG, embeds it in a 4×6 PDF, and opens
 * the PDF in a new tab so the browser's native PDF print handles
 * page sizing perfectly (no Safari CSS print clipping).
 *
 * captureElementAsPdf() — captures the on-screen preview as a PDF
 * for the "Save PDF" download button only.
 */

import { toPng } from "html-to-image";
import jsPDF from "jspdf";

/* ------------------------------------------------------------------ */
/*  PRINT                                                              */
/* ------------------------------------------------------------------ */

export async function printLabelHtml(
  labelInnerHtml: string,
  widthInches: number,
  heightInches: number
): Promise<void> {
  // 1. Create an off-screen container sized exactly to the label
  const widthPx = Math.round(widthInches * 96);
  const heightPx = Math.round(heightInches * 96);

  const container = document.createElement("div");
  container.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: ${widthPx}px;
    height: ${heightPx}px;
    background: white;
    z-index: -1;
    overflow: hidden;
  `;

  // The .label wrapper — mirrors the print styles
  const labelDiv = document.createElement("div");
  labelDiv.style.cssText = `
    width: ${widthPx}px;
    height: ${heightPx}px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 2px solid #111;
    background: white;
    font-family: Arial, Helvetica, sans-serif;
    box-sizing: border-box;
  `;
  labelDiv.innerHTML = labelInnerHtml;
  container.appendChild(labelDiv);
  document.body.appendChild(container);

  // 2. Wait for all images (barcodes) to finish loading
  const imgs = labelDiv.querySelectorAll("img");
  const imgPromises: Promise<void>[] = [];
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i] as HTMLImageElement;
    if (!img.complete) {
      imgPromises.push(
        new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
      );
    }
  }
  await Promise.all(imgPromises);

  // Small extra delay for rendering to settle
  await new Promise((r) => setTimeout(r, 200));

  // 3. Capture the label as a high-resolution PNG
  let imgDataUrl: string;
  try {
    imgDataUrl = await toPng(labelDiv, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: "#ffffff",
      width: widthPx,
      height: heightPx,
    });
  } finally {
    document.body.removeChild(container);
  }

  // 4. Create a PDF with exact label dimensions
  const pdf = new jsPDF({
    orientation: heightInches > widthInches ? "portrait" : "landscape",
    unit: "in",
    format: [widthInches, heightInches],
  });
  pdf.addImage(imgDataUrl, "PNG", 0, 0, widthInches, heightInches);

  // 5. Open the PDF in a new tab — the browser's PDF viewer handles
  //    print perfectly with fixed page dimensions, no CSS clipping.
  const pdfBlob = pdf.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(blobUrl, "_blank");

  if (!printWindow) {
    // Fallback: download the PDF directly
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "label.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return;
  }

  // Clean up blob URL after window is closed
  const checkClosed = setInterval(() => {
    try {
      if (printWindow.closed) {
        clearInterval(checkClosed);
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      clearInterval(checkClosed);
      URL.revokeObjectURL(blobUrl);
    }
  }, 2000);
}

/* ------------------------------------------------------------------ */
/*  SAVE PDF                                                           */
/* ------------------------------------------------------------------ */

export async function captureElementAsPdf(
  element: HTMLElement,
  widthInches: number,
  heightInches: number
): Promise<Blob> {
  const imgDataUrl = await toPng(element, {
    pixelRatio: 3,
    cacheBust: true,
    backgroundColor: "#ffffff",
  });

  const pdf = new jsPDF({
    orientation: heightInches > widthInches ? "portrait" : "landscape",
    unit: "in",
    format: [widthInches, heightInches],
  });

  pdf.addImage(imgDataUrl, "PNG", 0, 0, widthInches, heightInches);

  return pdf.output("blob");
}
