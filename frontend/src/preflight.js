// Document preflight: checks a chosen file in the browser before it is attached, so that an
// application is not sent back for an unreadable scan. Nothing here changes what the applicant
// typed; it only tells them about problems with the file.
//
// Errors stop the file being attached:   wrong format, the file is not what it says it is,
//                                         corrupt or unreadable, too large, too small to read.
// Warnings let it through with a note:   blurred, too dark or washed out, low resolution, or
//                                         the document may be cut off at an edge.

const MAGIC = [
    { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { type: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
    { type: "image/webp", test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
    { type: "application/pdf", test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
];
const NAMES = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP", "application/pdf": "PDF" };
export const typeNames = (types) => types.map((t) => NAMES[t] ?? t).join(", ");
const mb = (n) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

const readAs = (file, how) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("The file could not be read. Choose it again."));
    r[how](file);
});

const decode = (dataUrl) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This image is damaged or incomplete and cannot be opened. Scan or photograph the document again."));
    img.src = dataUrl;
});

/** Sharpness, brightness and edge content from a small greyscale copy of the image. */
function measure(img) {
    const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(8, Math.round(img.naturalWidth * scale)), h = Math.max(8, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    let sum = 0;
    for (let i = 0; i < w * h; i += 1) { g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; sum += g[i]; }
    const mean = sum / (w * h);
    // Variance of the Laplacian: low when the picture has no sharp edges (out of focus or shaken).
    let lsum = 0, lsq = 0, n = 0;
    for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        const l = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
        lsum += l; lsq += l * l; n += 1;
    }
    const sharpness = n ? lsq / n - (lsum / n) ** 2 : 0;
    // Edge content: a document that runs off the frame has strong detail on the outermost rows.
    const band = (pick) => { let s = 0, c = 0; for (const i of pick) { const d = Math.abs(g[i] - g[i + 1] || 0); s += d; c += 1; } return c ? s / c : 0; };
    const rows = (y) => Array.from({ length: w - 1 }, (_, x) => y * w + x);
    const cols = (x) => Array.from({ length: h - 1 }, (_, y) => y * w + x);
    const edges = [band(rows(1)), band(rows(h - 2)), band(cols(1)), band(cols(w - 2))];
    return { mean, sharpness, edgeBusy: edges.filter((e) => e > 18).length };
}

/**
 * Checks a file and reads it. Resolves to { dataUrl, warnings, width, height }; rejects with an
 * Error whose message can be shown to the applicant.
 */
export async function preflightDocument(file, { types = ["image/jpeg", "image/png", "application/pdf"], maxBytes = 4 * 1024 * 1024, label = "The document" } = {}) {
    if (!file) throw new Error("Choose a file.");
    if (file.size === 0) throw new Error(`${label} is an empty file. Choose it again.`);
    if (!types.includes(file.type)) throw new Error(`${label} must be ${typeNames(types)}. This file is ${NAMES[file.type] ?? (file.type || "of an unknown type")}.`);
    if (file.size > maxBytes) throw new Error(`${label} is ${mb(file.size)}; the limit is ${mb(maxBytes)}. Scan it at a lower resolution or save it as JPEG.`);
    const head = new Uint8Array(await readAs(file.slice(0, 16), "readAsArrayBuffer"));
    const actual = MAGIC.find((m) => m.test(head))?.type;
    if (!actual) throw new Error(`${label} is damaged or is not really a ${NAMES[file.type] ?? "document"} file.`);
    if (actual !== file.type && !(types.includes(actual))) throw new Error(`${label} is named as ${NAMES[file.type]} but is actually ${NAMES[actual]}, which is not accepted here.`);
    const dataUrl = await readAs(file, "readAsDataURL");
    const warnings = [];
    if (actual === "application/pdf") {
        const tail = await readAs(file.slice(Math.max(0, file.size - 1024)), "readAsText");
        if (!tail.includes("%%EOF")) throw new Error(`${label} is an incomplete PDF (it may not have finished downloading). Save it again and retry.`);
        return { dataUrl, warnings, mimeType: actual };
    }
    const img = await decode(dataUrl);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (Math.min(width, height) < 300) throw new Error(`${label} is only ${width}×${height} pixels, too small to read. Photograph it closer or scan at 150 dpi or more.`);
    if (Math.min(width, height) < 700) warnings.push(`Low resolution (${width}×${height}). Small print may not be readable.`);
    const m = measure(img);
    if (m) {
        if (m.sharpness < 60) warnings.push("The picture looks blurred. Hold the camera steady and make sure the text is in focus.");
        if (m.mean < 55) warnings.push("The picture is very dark. Take it again in good light.");
        else if (m.mean > 245) warnings.push("The picture is washed out. Avoid flash and direct glare.");
        if (m.edgeBusy >= 2) warnings.push("The document may be cut off at the edges. Make sure all four corners are in the picture.");
    }
    return { dataUrl, warnings, width, height, mimeType: actual };
}
