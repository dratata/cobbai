/**
 * dicomSupport.ts
 * DICOM file support — lazy-loaded via dynamic import.
 *
 * To enable: npm install dicom-parser
 * Then uncomment the import below.
 *
 * Reference: https://github.com/cornerstonejs/dicomParser
 */

export interface DicomMetadata {
  patientName?: string;
  studyDate?: string;
  modality?: string;
  rows?: number;
  columns?: number;
}

export interface DicomLoadResult {
  base64: string;
  mimeType: 'image/png';
  metadata: DicomMetadata;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Load a .dcm file and render it to a base64 PNG.
 * Returns null if dicom-parser is not installed.
 */
export async function loadDicomFile(file: File): Promise<DicomLoadResult | null> {
  // Dynamic import — only loads if user uploads .dcm file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dicomParser: any = null;
  try {
    // @ts-expect-error — dicom-parser is optional; install with: npm install dicom-parser
    dicomParser = await import('dicom-parser');
  } catch {
    console.warn(
      'dicom-parser not installed. Run: npm install dicom-parser\n' +
      'DICOM support is a placeholder — install the package to enable it.'
    );
    return null;
  }

  const arrayBuffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(arrayBuffer);

  try {
    const dataset = dicomParser.default.parseDicom(byteArray);

    // Extract metadata
    const metadata: DicomMetadata = {
      patientName: dataset.string('x00100010'),
      studyDate:   dataset.string('x00080020'),
      modality:    dataset.string('x00080060'),
      rows:        dataset.uint16('x00280010'),
      columns:     dataset.uint16('x00280011'),
    };

    // Extract pixel data and render to canvas
    const rows    = metadata.rows    || 512;
    const columns = metadata.columns || 512;
    const pixelData = dataset.elements.x7fe00010;

    const canvas = document.createElement('canvas');
    canvas.width = columns; canvas.height = rows;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(columns, rows);

    // Simple 16-bit to 8-bit conversion (windowing)
    const rawPixels = new Uint16Array(arrayBuffer, pixelData.dataOffset, pixelData.length / 2);
    let minV = Infinity, maxV = -Infinity;
    rawPixels.forEach(v => { if (v < minV) minV = v; if (v > maxV) maxV = v; });
    const range = maxV - minV || 1;

    for (let i = 0; i < rawPixels.length; i++) {
      const val = Math.round(((rawPixels[i] - minV) / range) * 255);
      imageData.data[i*4]   = val;
      imageData.data[i*4+1] = val;
      imageData.data[i*4+2] = val;
      imageData.data[i*4+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    // Anonymize: do not expose patient metadata beyond basic info
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    return { base64, mimeType: 'image/png', metadata: { modality: metadata.modality, rows, columns }, naturalWidth: columns, naturalHeight: rows };

  } catch (err) {
    console.error('DICOM parse error:', err);
    return null;
  }
}

/** Check if a file is a DICOM file (by extension or magic bytes) */
export function isDicomFile(file: File): boolean {
  if (file.name.toLowerCase().endsWith('.dcm')) return true;
  // DICOM magic bytes: 'DICM' at offset 128
  return false; // Full magic byte check requires async read
}
