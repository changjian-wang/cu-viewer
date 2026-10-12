import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "tests", "fixtures", "images");
const source = readFileSync(resolve(root, "tests", "fixtures", "receipt.png"));
const browser = await chromium.launch({ channel: "chrome" });
let native;
try {
    const page = await browser.newPage();
    native = await page.evaluate(async encoded => {
        const image = await createImageBitmap(new Blob([Uint8Array.from(atob(encoded), value => value.charCodeAt(0))]));
        const width = image.width;
        const height = image.height;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Fixture rendering is unavailable.");
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        image.close();
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let rgba = "";
        for (let offset = 0; offset < pixels.length; offset += 8192) rgba += String.fromCharCode(...pixels.subarray(offset, offset + 8192));
        const jpeg = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
        canvas.width = 96;
        canvas.height = 64;
        const colors = ["#d13438", "#8cbd18", "#0078d4", "#ffaa44"];
        colors.forEach((color, index) => {
            context.fillStyle = color;
            context.fillRect(index % 2 * 48, Math.floor(index / 2) * 32, 48, 32);
        });
        return { width, height, jpeg, rgba: btoa(rgba),
            markerPng: canvas.toDataURL("image/png").split(",")[1],
            markerJpeg: canvas.toDataURL("image/jpeg", 1).split(",")[1] };
    }, source.toString("base64"));
} finally {
    await browser.close();
}

mkdirSync(output, { recursive: true });
const entries = [];
const save = (name, bytes, description) => {
    writeFileSync(resolve(output, name), bytes);
    entries.push({ name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), description });
};
save("receipt-derived.jpg", Buffer.from(native.jpeg, "base64"), "Derived from licensed receipt.png; original full pixel canvas flattened onto white, no new Analyze result.");
const pixels = Buffer.from(native.rgba, "base64");
const stride = Math.ceil(native.width * 3 / 4) * 4;
const bmp = Buffer.alloc(54 + stride * native.height);
bmp.write("BM");
bmp.writeUInt32LE(bmp.length, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(native.width, 18);
bmp.writeInt32LE(native.height, 22);
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(stride * native.height, 34);
for (let y = 0; y < native.height; y++) {
    for (let x = 0; x < native.width; x++) {
        const from = (y * native.width + x) * 4;
        const to = 54 + (native.height - y - 1) * stride + x * 3;
        bmp[to] = pixels[from + 2];
        bmp[to + 1] = pixels[from + 1];
        bmp[to + 2] = pixels[from];
    }
}
save("receipt-derived.bmp", bmp, "Derived from licensed receipt.png; full-size white-flattened BGR24 bottom-up BMP, no new Analyze result.");
save("orientation-marker.png", Buffer.from(native.markerPng, "base64"), "Synthetic 96x64 four-color orientation marker; not CU service output.");
const marker = Buffer.from(native.markerJpeg, "base64");
for (let orientation = 1; orientation <= 8; orientation++) {
    const exif = Buffer.alloc(36);
    exif.set([0xff, 0xe1, 0, 34, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0]);
    exif.writeUInt16LE(1, 18);
    exif.writeUInt16LE(0x0112, 20);
    exif.writeUInt16LE(3, 22);
    exif.writeUInt32LE(1, 24);
    exif.writeUInt16LE(orientation, 28);
    save(`orientation-${orientation}.jpg`, Buffer.concat([marker.subarray(0, 2), exif, marker.subarray(2)]),
        `Synthetic JPEG EXIF orientation ${orientation}; same encoded pixels as other orientation fixtures.`);
}
console.log(JSON.stringify({ sourceSha256: createHash("sha256").update(source).digest("hex"), entries }, null, 2));
