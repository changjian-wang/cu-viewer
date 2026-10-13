function buildPdf(objects: readonly string[]): Buffer {
    let bytes = "%PDF-1.7\n";
    const offsets = [0];
    for (const [index, object] of objects.entries()) {
        offsets.push(Buffer.byteLength(bytes));
        bytes += `${index + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(bytes);
    bytes += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    bytes += offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
    bytes += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(bytes);
}

function stream(content: string): string {
    return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
}

export function standardFontPdf(): Buffer {
    const content = "BT /F1 18 Tf 40 120 Td (Synthetic standard-font resource test) Tj ET";
    return buildPdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        stream(content),
    ]);
}

export function croppedRotatedPdf(): Buffer {
    const first = "0.84 0.20 0.22 rg 50 50 300 200 re f";
    const second = "0.00 0.47 0.83 rg 20 30 360 240 re f";
    return buildPdf([
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /CropBox [50 50 350 250] /Contents 5 0 R >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /CropBox [20 30 380 270] /Rotate 90 /Contents 6 0 R >>",
        stream(first),
        stream(second),
    ]);
}
