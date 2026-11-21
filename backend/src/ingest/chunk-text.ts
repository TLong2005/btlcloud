const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }
  return pack(splitUnits(normalized));
}

function splitUnits(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= CHUNK_SIZE) {
      units.push(paragraph);
      continue;
    }
    units.push(...splitSentences(paragraph));
  }
  return units;
}

function splitSentences(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?…])\s+/);
  const units: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length > CHUNK_SIZE) {
      if (current) {
        units.push(current);
        current = '';
      }
      units.push(...hardSplit(trimmed));
      continue;
    }
    const candidate = current ? `${current} ${trimmed}` : trimmed;
    if (candidate.length <= CHUNK_SIZE) {
      current = candidate;
    } else {
      if (current) {
        units.push(current);
      }
      current = trimmed;
    }
  }
  if (current) {
    units.push(current);
  }
  return units;
}

function hardSplit(value: string): string[] {
  const parts: string[] = [];
  const step = CHUNK_SIZE - CHUNK_OVERLAP;
  for (let index = 0; index < value.length; index += step) {
    const part = value.slice(index, index + CHUNK_SIZE).trim();
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}

function pack(units: string[]): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    if (!current) {
      current = unit;
      continue;
    }
    const joined = `${current}\n\n${unit}`;
    if (joined.length <= CHUNK_SIZE) {
      current = joined;
      continue;
    }
    chunks.push(current.trim());
    current = withOverlap(current, unit);
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

function withOverlap(previous: string, next: string): string {
  const tail = previous.slice(-CHUNK_OVERLAP).trim();
  if (!tail) {
    return next;
  }
  return `${tail}\n${next}`.trim();
}
