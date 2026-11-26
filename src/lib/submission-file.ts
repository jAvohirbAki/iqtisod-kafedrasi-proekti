import { randomUUID } from "node:crypto";
import path from "node:path";
import { createInflateRaw, inflateRawSync } from "node:zlib";
import { MAX_UPLOAD_BYTES } from "./storage";
import { SUBMISSION_FILE_LIMIT_MB, SUBMISSION_FILE_TYPES } from "./submission-file-formats";

const hardLimit = SUBMISSION_FILE_LIMIT_MB * 1024 * 1024;
const fileLimit = Number.isSafeInteger(MAX_UPLOAD_BYTES) && MAX_UPLOAD_BYTES > 0
  ? Math.min(MAX_UPLOAD_BYTES, hardLimit)
  : hardLimit;
const requestLimit = fileLimit + 256 * 1024;

export class SubmissionUploadError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readSubmissionForm(request: Request) {
  const tooLarge = () => new SubmissionUploadError("Yuklanayotgan ma'lumot hajmi ruxsat etilgan chegaradan oshdi", 413);
  if (Number(request.headers.get("content-length")) > requestLimit) throw tooLarge();
  if (!request.body) throw new SubmissionUploadError("Topshiriq ma'lumotlari yuborilmagan", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > requestLimit) {
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks, size);
    const contentType = request.headers.get("content-type") ?? "";
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof SubmissionUploadError) throw error;
    throw new SubmissionUploadError("Topshiriq ma'lumotlarini o'qib bo'lmadi", 400);
  } finally {
    reader.releaseLock();
  }
}

// ZIP records reference local headers and payloads without extracting archive entries.
function readZipEntries(file: Buffer) {
  if (file.length < 22) return null;
  const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), file.length - 22);
  if (end < 0 || end + 22 + file.readUInt16LE(end + 20) !== file.length ||
      file.readUInt32LE(end + 4) !== 0) return null;

  const count = file.readUInt16LE(end + 10);
  const start = file.readUInt32LE(end + 16);
  if (count > 4096 || file.readUInt16LE(end + 8) !== count ||
      start + file.readUInt32LE(end + 12) !== end) return null;
  if (count > 0 && file.readUInt32LE(0) !== 0x04034b50) return null;

  const entries = new Map<string, { data: Buffer; method: number; flags: number; size: number }>();
  let offset = start;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || file.readUInt32LE(offset) !== 0x02014b50) return null;
    const nameStart = offset + 46;
    const nameEnd = nameStart + file.readUInt16LE(offset + 28);
    const next = nameEnd + file.readUInt16LE(offset + 30) + file.readUInt16LE(offset + 32);
    const local = file.readUInt32LE(offset + 42);
    if (next > end || local + 30 > start || file.readUInt32LE(local) !== 0x04034b50) return null;

    const rawName = file.subarray(nameStart, nameEnd);
    const localNameEnd = local + 30 + file.readUInt16LE(local + 26);
    const dataStart = localNameEnd + file.readUInt16LE(local + 28);
    const dataEnd = dataStart + file.readUInt32LE(offset + 20);
    const method = file.readUInt16LE(offset + 10);
    const flags = file.readUInt16LE(offset + 8);
    if (dataEnd > start || !rawName.length || !rawName.equals(file.subarray(local + 30, localNameEnd)) ||
        method !== file.readUInt16LE(local + 8) || flags !== file.readUInt16LE(local + 6)) return null;

    const name = rawName.toString("utf8");
    if (entries.has(name)) return null;
    entries.set(name, {
      data: file.subarray(dataStart, dataEnd),
      method,
      flags,
      size: file.readUInt32LE(offset + 24),
    });
    offset = next;
  }
  return offset === end ? entries : null;
}

const officeParts: Record<string, { part: string; contentType: string; root: string; namespace: string } | undefined> = {
  ".docx": {
    part: "word/document.xml",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    root: "document",
    namespace: "wordprocessingml",
  },
  ".xlsx": {
    part: "xl/workbook.xml",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    root: "workbook",
    namespace: "spreadsheetml",
  },
  ".pptx": {
    part: "ppt/presentation.xml",
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    root: "presentation",
    namespace: "presentationml",
  },
};

async function matchesOfficePackage(file: Buffer, extension: string) {
  const entries = readZipEntries(file);
  if (!entries) return false;
  if (extension === ".zip") return true;

  const format = officeParts[extension];
  if (!format) return false;
  const { part, contentType, root, namespace } = format;
  const manifest = entries.get("[Content_Types].xml");
  const document = entries.get(part);
  const manifestLimit = 1024 * 1024;
  if (!manifest || !document || document.size === 0 || document.data.length === 0 || !entries.has("_rels/.rels") ||
      (manifest.flags & 1) || (document.flags & 1) || manifest.size > manifestLimit) return false;
  let xml: Buffer;
  if (manifest.method === 0) {
    if (manifest.data.length > manifestLimit) return false;
    xml = manifest.data;
  } else if (manifest.method === 8) {
    try {
      xml = inflateRawSync(manifest.data, { maxOutputLength: manifestLimit });
    } catch {
      return false;
    }
  } else {
    return false;
  }
  if (xml.length !== manifest.size) return false;

  const hasMainPart = Array.from(xml.toString("utf8").matchAll(/<(?:[\w.-]+:)?Override\s+[^<>]*>/g))
    .some(([entry]) => entry.match(/\sPartName\s*=\s*(['"])(.*?)\1/)?.[2] === `/${part}` &&
      entry.match(/\sContentType\s*=\s*(['"])(.*?)\1/)?.[2] === contentType);
  if (!hasMainPart) return false;

  // Only inspect the opening XML element. Never expand the full document or other archive entries.
  const checkRoot = (prefix: Buffer) => {
    const openingTag = prefix.toString("utf8")
      .match(/^\s*(?:<\?xml[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<((?:[\w.-]+:)?[\w.-]+)\b([^<>]*)>/);
    return openingTag?.[1].split(":").pop() === root &&
      (openingTag[2].includes(`http://schemas.openxmlformats.org/${namespace}/2006/main`) ||
        openingTag[2].includes(`http://purl.oclc.org/ooxml/${namespace}/main`));
  };
  if (document.method === 0) return checkRoot(document.data.subarray(0, 8192));
  if (document.method !== 8) return false;
  const decoder = createInflateRaw({ chunkSize: 8192 });
  try {
    decoder.end(document.data);
    for await (const prefix of decoder) return checkRoot(prefix);
  } catch {
    return false;
  }
  return false;
}

function matchesWordDocument(file: Buffer) {
  if (file.length < 1536 || file.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1") return false;
  const version = file.readUInt16LE(26);
  const sectorSize = version === 3 ? 512 : 4096;
  if ((version !== 3 && version !== 4) || file.readUInt16LE(30) !== Math.log2(sectorSize) ||
      file.readUInt16LE(28) !== 0xfffe || file.readUInt16LE(32) !== 6 ||
      file.length % sectorSize !== 0) return false;
  const sectorCount = file.length / sectorSize - 1;
  const sectorOffset = (id: number) => (id + 1) * sectorSize;
  const wordsPerSector = sectorSize / 4;
  const fatCount = file.readUInt32LE(44);
  if (!fatCount || fatCount > sectorCount) return false;

  const fat = Array.from({ length: Math.min(fatCount, 109) }, (_, i) => file.readUInt32LE(76 + i * 4));
  let difat = file.readUInt32LE(68);
  const visitedDifat = new Set<number>();
  while (fat.length < fatCount) {
    if (difat >= sectorCount || visitedDifat.has(difat)) return false;
    visitedDifat.add(difat);
    const offset = sectorOffset(difat);
    for (let i = 0; i < wordsPerSector - 1 && fat.length < fatCount; i++) {
      fat.push(file.readUInt32LE(offset + i * 4));
    }
    difat = file.readUInt32LE(offset + sectorSize - 4);
  }
  if (fat.some((id) => id >= sectorCount) || new Set(fat).size !== fat.length) return false;
  const nextSector = (id: number) => {
    const fatSector = fat[Math.floor(id / wordsPerSector)];
    return fatSector === undefined
      ? 0xffffffff
      : file.readUInt32LE(sectorOffset(fatSector) + (id % wordsPerSector) * 4);
  };

  let directory = file.readUInt32LE(48);
  if (directory >= sectorCount || file[sectorOffset(directory) + 66] !== 5) return false;
  const root = sectorOffset(directory);
  const visited = new Set<number>();
  let wordEntry: number | undefined;
  const tableStreams = new Set<string>();
  while (directory < sectorCount && !visited.has(directory)) {
    visited.add(directory);
    const offset = sectorOffset(directory);
    for (let entry = offset; entry < offset + sectorSize; entry += 128) {
      const nameSize = file.readUInt16LE(entry + 64);
      if (file[entry + 66] !== 2 || nameSize < 2 || nameSize > 64 || nameSize % 2 ||
          file.readUInt16LE(entry + nameSize - 2) !== 0) continue;
      const name = file.toString("utf16le", entry, entry + nameSize - 2);
      if (name === "WordDocument") wordEntry = entry;
      if (name === "0Table" || name === "1Table") tableStreams.add(name);
    }
    directory = nextSector(directory);
  }
  if (directory !== 0xfffffffe || wordEntry === undefined || !tableStreams.size) return false;

  const streamSize = file.readUInt32LE(wordEntry + 120);
  let streamSector = file.readUInt32LE(wordEntry + 116);
  let offset = 0;
  if (streamSize < 32 || streamSize > file.length) return false;
  if (streamSize < 4096) {
    const miniOffset = streamSector * 64;
    if (miniOffset + 32 > file.readUInt32LE(root + 120) || miniOffset > file.length) return false;
    streamSector = file.readUInt32LE(root + 116);
    for (let remaining = miniOffset; remaining >= sectorSize && streamSector < sectorCount; remaining -= sectorSize) {
      streamSector = nextSector(streamSector);
    }
    offset = miniOffset % sectorSize;
  }
  if (streamSector >= sectorCount) return false;
  const fib = sectorOffset(streamSector) + offset;
  const tableStream = file.readUInt16LE(fib + 10) & 0x0200 ? "1Table" : "0Table";
  return file.readUInt16LE(fib) === 0xa5ec && tableStreams.has(tableStream);
}

function matchesFileContent(file: Buffer, extension: string): boolean | Promise<boolean> {
  switch (extension) {
    case ".pdf": {
      if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r|\n)/.test(file.toString("latin1", 0, 10))) return false;
      const trailer = file.subarray(-4096).toString("latin1").match(/startxref\s+(\d+)\s+%%EOF[\0\t\n\f\r ]*$/);
      const offset = Number(trailer?.[1]);
      return offset > 0 && offset < file.length &&
        /^(?:xref\s|\d+\s+\d+\s+obj\b)/.test(file.toString("latin1", offset, offset + 48));
    }
    case ".doc":
      return matchesWordDocument(file);
    case ".zip":
    case ".docx":
    case ".xlsx":
    case ".pptx":
      return matchesOfficePackage(file, extension);
    case ".rar":
      return file.length >= 20 && (file.subarray(0, 8).toString("hex") === "526172211a070100" ||
        (file.subarray(0, 7).toString("hex") === "526172211a0700" && file[9] === 0x73));
    case ".png":
      return file.length >= 45 && file.subarray(0, 16).toString("hex") === "89504e470d0a1a0a0000000d49484452" &&
        file.subarray(-12).toString("hex") === "0000000049454e44ae426082";
    case ".jpg":
    case ".jpeg":
      return file.length >= 16 && file.subarray(0, 3).toString("hex") === "ffd8ff" &&
        file.subarray(-2).toString("hex") === "ffd9";
    case ".webp":
      return file.length >= 20 && file.toString("ascii", 0, 4) === "RIFF" &&
        file.readUInt32LE(4) + 8 === file.length && /^WEBPVP8[ LX]$/.test(file.toString("ascii", 8, 16));
    case ".txt": {
      const bom = file.subarray(0, 2).toString("hex");
      const encoding = bom === "fffe" ? "utf-16le" : bom === "feff" ? "utf-16be" : "utf-8";
      try {
        const text = new TextDecoder(encoding, { fatal: true }).decode(file);
        return !/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

export async function prepareSubmissionFile(file: FormDataEntryValue | null) {
  if (file === null) return null;
  if (!(file instanceof File)) throw new SubmissionUploadError("Fayl ma'lumoti noto'g'ri", 400);
  if (!file.name && file.size === 0) return null;
  const name = path.win32.basename(file.name);
  if (!name || name.length > 255 || /[\x00-\x1f\x7f]/.test(name)) {
    throw new SubmissionUploadError("Fayl nomi noto'g'ri", 400);
  }
  if (file.size === 0) throw new SubmissionUploadError("Yuklangan fayl bo'sh bo'lishi mumkin emas", 400);
  if (file.size > fileLimit) {
    throw new SubmissionUploadError(`Fayl hajmi ${fileLimit / 1024 / 1024} MiB dan oshmasligi kerak`, 413);
  }
  const extension = path.extname(name).toLowerCase();
  const mimeType = Object.hasOwn(SUBMISSION_FILE_TYPES, extension) ? SUBMISSION_FILE_TYPES[extension] : undefined;
  if (!mimeType) throw new SubmissionUploadError("Bu fayl formatiga ruxsat berilmagan", 415);
  const content = Buffer.from(await file.arrayBuffer());
  if (!(await matchesFileContent(content, extension))) {
    throw new SubmissionUploadError("Fayl mazmuni ko'rsatilgan formatga mos emas yoki fayl buzilgan", 415);
  }
  return { path: `submissions/db-${randomUUID()}`, name, mimeType, size: file.size, content };
}
