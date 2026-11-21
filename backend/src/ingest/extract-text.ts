import { readFile } from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const EMPTY_TEXT = 'Không trích xuất được nội dung văn bản';

export async function extractText(filePath: string, filename: string): Promise<string> {
  const buffer = await readFile(filePath);
  const extension = path.extname(filename).toLowerCase();
  let text = '';

  if (extension === '.txt') {
    text = buffer.toString('utf8');
  } else if (extension === '.pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    throw new Error('Định dạng tệp không được hỗ trợ');
  }

  if (!text.trim()) {
    throw new Error(EMPTY_TEXT);
  }
  return text;
}
