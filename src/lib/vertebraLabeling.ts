/**
 * vertebraLabeling.ts
 * Local sequential vertebra labeling.
 * Given known end vertebrae (e.g., T5 and T12), infers intermediate vertebrae by
 * linear interpolation of image Y-coordinates.
 * No API call required.
 */

export interface VertebralLevel {
  name: string;
  region: 'C' | 'T' | 'L' | 'S';
  number: number;
}

export interface LabeledVertebra {
  name: string;
  /** Normalised Y coordinate in image [0,1] */
  normY: number;
  isMeasured: boolean;
  isInferred: boolean;
  /**
   * Labeling confidence (audit fix):
   *   'high'   — anchor vertebra name came from AI, directly measured
   *   'medium' — interpolated between two high-confidence anchors
   *   'low'    — sequence gap > 12 vertebrae or anchor names are inconsistent
   *              (e.g. lower vertebra appears above upper in the sequence)
   */
  confidence: 'high' | 'medium' | 'low';
}

// Canonical spine sequence (C1-C7, T1-T12, L1-L5, S1-S2)
const SPINE_SEQUENCE: VertebralLevel[] = [
  ...Array.from({length: 7},  (_, i) => ({ name: `C${i+1}`, region: 'C' as const, number: i+1 })),
  ...Array.from({length: 12}, (_, i) => ({ name: `T${i+1}`, region: 'T' as const, number: i+1 })),
  ...Array.from({length: 5},  (_, i) => ({ name: `L${i+1}`, region: 'L' as const, number: i+1 })),
  ...Array.from({length: 2},  (_, i) => ({ name: `S${i+1}`, region: 'S' as const, number: i+1 })),
];

/**
 * Parse a vertebra name like "T5", "L3", "C7" into a VertebralLevel.
 * Returns null if unparseable.
 */
export function parseVertebraName(name: string): VertebralLevel | null {
  if (!name) return null;
  const match = name.trim().match(/^([CLTSclts])(\d{1,2})$/);
  if (!match) return null;
  const region = match[1].toUpperCase() as 'C' | 'T' | 'L' | 'S';
  const number  = parseInt(match[2], 10);
  return { name: `${region}${number}`, region, number };
}

/**
 * Find the index in the canonical spine sequence.
 */
function seqIndex(name: string): number {
  return SPINE_SEQUENCE.findIndex(v => v.name === name.trim().toUpperCase());
}

/**
 * Infer vertebrae between two known anchor points.
 *
 * @param upperName   e.g. "T5"
 * @param lowerName   e.g. "T12"
 * @param upperNormY  normalised Y of upper anchor [0,1]
 * @param lowerNormY  normalised Y of lower anchor [0,1]
 * @returns Array of labeled vertebrae including anchors + inferred intermediate levels
 */
export function inferIntermediateVertebrae(
  upperName: string,
  lowerName: string,
  upperNormY: number,
  lowerNormY: number
): LabeledVertebra[] {
  const ui = seqIndex(upperName);
  const li = seqIndex(lowerName);

  // Confidence rules (audit fix):
  // • Low if anchors are unparseable or out-of-order
  // • Low if the span is > 12 vertebrae (labeling unreliable at that distance)
  // • Medium for interpolated vertebrae
  // • High for anchors
  const badSequence = ui < 0 || li < 0 || ui >= li;
  const tooLong     = !badSequence && (li - ui) > 12;

  if (badSequence) {
    return [
      { name: upperName, normY: upperNormY, isMeasured: true, isInferred: false, confidence: 'low' },
      { name: lowerName, normY: lowerNormY, isMeasured: true, isInferred: false, confidence: 'low' },
    ];
  }

  const count = li - ui;
  const result: LabeledVertebra[] = [];
  for (let i = 0; i <= count; i++) {
    const t = count === 0 ? 0 : i / count;
    const isAnchor = i === 0 || i === count;
    result.push({
      name:       SPINE_SEQUENCE[ui + i].name,
      normY:      upperNormY + t * (lowerNormY - upperNormY),
      isMeasured: isAnchor,
      isInferred: !isAnchor,
      confidence: tooLong ? 'low' : isAnchor ? 'high' : 'medium',
    });
  }
  return result;
}

/**
 * Given a curve's known upper and lower vertebra names plus the image's
 * curve Y range, return a list of inferred vertebrae for overlay display.
 */
export function getSpineLevelLabels(
  upperName?: string,
  lowerName?: string,
  upperY?: number,
  lowerY?: number
): LabeledVertebra[] {
  if (!upperName || !lowerName || upperY == null || lowerY == null) return [];
  return inferIntermediateVertebrae(upperName, lowerName, upperY, lowerY);
}
