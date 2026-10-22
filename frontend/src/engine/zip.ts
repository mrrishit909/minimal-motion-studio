// A store-only (uncompressed) ZIP writer: entries sorted by name, UTF-8 names, a fixed DOS timestamp of
// 1980-01-01 00:00, CRC-32 per entry. The same files always give the same bytes.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = (CRC_TABLE[(c ^ (data[i] as number)) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const UTF8_FLAG = 0x0800;

export function zip(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder();
  const names = Object.keys(files).sort();
  const entries = names.map((name) => {
    const v = files[name] as string | Uint8Array;
    const data = typeof v === "string" ? enc.encode(v) : v;
    return { name: enc.encode(name), data, crc: crc32(data) };
  });
  const localSize = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  if (localSize + centralSize + 22 > 0xffffffff || entries.length > 0xffff) throw new Error("package too large for a plain zip");
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => { view.setUint16(p, v, true); p += 2; };
  const u32 = (v: number) => { view.setUint32(p, v, true); p += 4; };
  const bytes = (b: Uint8Array) => { out.set(b, p); p += b.length; };
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(p);
    u32(0x04034b50); u16(20); u16(UTF8_FLAG); u16(0); u16(DOS_TIME); u16(DOS_DATE);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0);
    bytes(e.name); bytes(e.data);
  }
  const centralStart = p;
  entries.forEach((e, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(UTF8_FLAG); u16(0); u16(DOS_TIME); u16(DOS_DATE);
    u32(e.crc); u32(e.data.length); u32(e.data.length); u16(e.name.length); u16(0); u16(0);
    u16(0); u16(0); u32(0); u32(offsets[i] as number);
    bytes(e.name);
  });
  const centralLength = p - centralStart;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length);
  u32(centralLength); u32(centralStart); u16(0);
  return out;
}
