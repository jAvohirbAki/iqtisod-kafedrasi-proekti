import { crc32, deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { prepareSubmissionFile, readSubmissionForm } from "../submission-file";

function zip(entries: Record<string, string>) {
  const localEntries: Buffer[] = [];
  const directoryEntries: Buffer[] = [];
  let directoryStart = 0;
  for (const [name, text] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const content = Buffer.from(text);
    const packed = deflateRawSync(content);
    const checksum = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    localEntries.push(local, filename, packed);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(filename.length, 28);
    directory.writeUInt32LE(directoryStart, 42);
    directoryEntries.push(directory, filename);
    directoryStart += local.length + filename.length + packed.length;
  }
  const directory = Buffer.concat(directoryEntries);
  const end = Buffer.alloc(22);
  const entryCount = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryCount, 8);
  end.writeUInt16LE(entryCount, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(directoryStart, 16);
  return Buffer.concat([...localEntries, directory, end]);
}

describe("submission uploads", () => {
  it("detects a PDF from its content independently of the declared MIME type", async () => {
    const header = "%PDF-1.4\n";
    const content = `${header}xref\n0 1\n0000000000 65535 f\ntrailer\n<< /Size 1 >>\nstartxref\n${header.length}\n%%EOF\n`;
    const result = await prepareSubmissionFile(new File([content], "hisobot.pdf", { type: "text/plain" }));
    expect(result).toMatchObject({ name: "hisobot.pdf", mimeType: "application/pdf", size: content.length });
    expect(result?.content.toString()).toBe(content);
    await expect(prepareSubmissionFile(new File(["<html>fake</html>"], "fake.pdf", { type: "application/pdf" })))
      .rejects.toMatchObject({ status: 415 });
  });

  it("requires a Word document part and declaration for DOCX", async () => {
    const entries = {
      "[Content_Types].xml": '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      "_rels/.rels": "<Relationships/>",
      "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
    };
    const result = await prepareSubmissionFile(new File([zip(entries)], "hisobot.docx"));
    expect(result?.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(prepareSubmissionFile(new File([zip({ ...entries, "word/document.xml": "plain text" })], "fake.docx")))
      .rejects.toMatchObject({ status: 415 });
    await expect(prepareSubmissionFile(new File([zip({ "notes.txt": "plain text" })], "renamed.docx")))
      .rejects.toMatchObject({ status: 415 });
  });

  it("rejects the compound-file signature alone for DOC", async () => {
    const content = Buffer.alloc(1536);
    content.set(Buffer.from("d0cf11e0a1b11ae1", "hex"));
    await expect(prepareSubmissionFile(new File([content], "fake.doc"))).rejects.toMatchObject({ status: 415 });
  });

  it("recognizes a Word binary container with a WordDocument FIB and table stream", async () => {
    const sectorSize = 512;
    const content = Buffer.alloc(11 * sectorSize);
    content.set(Buffer.from("d0cf11e0a1b11ae1", "hex"));
    content.writeUInt16LE(3, 26);
    content.writeUInt16LE(0xfffe, 28);
    content.writeUInt16LE(9, 30);
    content.writeUInt16LE(6, 32);
    content.writeUInt32LE(1, 44);
    content.writeUInt32LE(1, 48);
    content.writeUInt32LE(4096, 56);
    content.writeUInt32LE(0, 76);
    content.fill(0xff, sectorSize, 2 * sectorSize);
    content.writeUInt32LE(0xfffffffd, sectorSize);
    content.writeUInt32LE(0xfffffffe, sectorSize + 4);
    for (let sector = 2; sector <= 9; sector++) {
      content.writeUInt32LE(sector === 9 ? 0xfffffffe : sector + 1, sectorSize + sector * 4);
    }

    const writeDirectoryEntry = (offset: number, name: string, type: number) => {
      const nameBytes = Buffer.from(`${name}\0`, "utf16le");
      nameBytes.copy(content, offset);
      content.writeUInt16LE(nameBytes.length, offset + 64);
      content[offset + 66] = type;
    };
    const directory = 2 * sectorSize;
    writeDirectoryEntry(directory, "Root Entry", 5);
    writeDirectoryEntry(directory + 128, "WordDocument", 2);
    content.writeUInt32LE(2, directory + 128 + 116);
    content.writeUInt32LE(4096, directory + 128 + 120);
    writeDirectoryEntry(directory + 256, "0Table", 2);
    content.writeUInt16LE(0xa5ec, 3 * sectorSize);

    const result = await prepareSubmissionFile(new File([content], "hisobot.doc"));
    expect(result).toMatchObject({ mimeType: "application/msword", size: content.length });
  });

  it("rejects an oversized request even if no Content-Length was given", async () => {
    const input = new Request("http://localhost/api/student/submissions", {
      method: "POST",
      body: new Uint8Array(21 * 1024 * 1024),
    });
    await expect(readSubmissionForm(input)).rejects.toMatchObject({ status: 413 });
  });
});
