import { deflateRawSync } from 'zlib';
import { Reflector } from '@nestjs/core';
import { SKIP_AUDIT_KEY } from '../audit-log/decorators/audit.decorator';
import { ImportFileSchema, ImportPreviewSchema, ImportMappingSchema } from '../scheduling/dto/scheduling-import.dto';
import { parseImportFile, guardXlsx } from '../scheduling/scheduling-import-parser';
import { mapImportRows } from '../scheduling/scheduling-import-mapping';
import { SchedulingSnapshot } from '../scheduling/scheduling-input-snapshot';
import { SchedulingImportController } from '../scheduling/scheduling-import.controller';
import { schedulingImportPolicy } from '../scheduling/scheduling-feature-policy';

// Tiny self-authored OOXML fixture, no external files, student records or new dependency.
function zip(entries: Record<string, string>) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name,text] of Object.entries(entries)) {
    const raw = Buffer.from(text), packed = deflateRawSync(raw), n = Buffer.from(name);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(8,8);
    h.writeUInt32LE(packed.length,18); h.writeUInt32LE(raw.length,22); h.writeUInt16LE(n.length,26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(8,10);
    c.writeUInt32LE(packed.length,20); c.writeUInt32LE(raw.length,24); c.writeUInt16LE(n.length,28); c.writeUInt32LE(offset,42);
    local.push(h,n,packed); central.push(c,n); offset += h.length+n.length+packed.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(entries).length,8); end.writeUInt16LE(Object.keys(entries).length,10);
  end.writeUInt32LE(dir.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,dir,end]);
}
function xlsx(sheet = '<row r="1"><c r="A1" t="inlineStr"><is><t>Penugasan</t></is></c><c r="B1" t="inlineStr"><is><t>Hari</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alias</t></is></c><c r="B2"><v>1</v></c></row>') {
  return { '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Jadwal" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+sheet+'</sheetData></worksheet>' };
}
const file = (text: string, options = {}) => ImportFileSchema.parse({ format: 'CSV', contentBase64: Buffer.from(text).toString('base64'), ...options });
const id = '84000000-0000-4000-8000-000000000010';
const classId = '84000000-0000-4000-8000-000000000002';
const mapping = ImportMappingSchema.parse({ columns: { assignment: 0, day: 1, jpStart: 2, jpEnd: 3 }, assignments: [{ source: 'Alias', assignmentId: id }] });
const input = { assignments: [{ id, classId }] } as SchedulingSnapshot;

describe('Wave 1B bounded import parser / mapping', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it.each([undefined,'false','TRUE','1',' true '])('exact import opt-in rejects %s', (flag) => {
    process.env.SMART_SCHEDULER_ENABLED = 'true';
    if (flag === undefined) delete process.env.SMART_SCHEDULER_IMPORT_ENABLED; else process.env.SMART_SCHEDULER_IMPORT_ENABLED = flag;
    expect(() => schedulingImportPolicy()).toThrow();
  });
  it('import cannot enable the main scheduler flag', () => {
    process.env.SMART_SCHEDULER_ENABLED = 'false'; process.env.SMART_SCHEDULER_IMPORT_ENABLED = 'true';
    expect(() => schedulingImportPolicy()).toThrow();
  });
  it('only pure inspection/catalog/preview bypass observational audit', () => {
    const r = new Reflector();
    for (const m of ['inspect','catalog','preview','commit'] as const) {
      expect(r.get(SKIP_AUDIT_KEY, SchedulingImportController.prototype[m])).toBe(m === 'commit' ? undefined : true);
    }
  });
  it.each([',',';','\t'] as const)('UTF8 CSV parses explicit delimiter %s', async (d) => {
    const parsed = await parseImportFile(file(`\uFEFFPenugasan${d}Hari${d}Mulai${d}Selesai\r\n"Alias"${d}Senin${d}1${d}2\r\n`, { delimiter:d }));
    expect(parsed.rows).toHaveLength(1); expect(parsed.rows[0]!.row).toBe(2);
    expect(mapImportRows(parsed,mapping,input,[classId]).slots[0]).toMatchObject({ assignmentId:id, dayOfWeek:1, jpStart:1,jpEnd:2,sessionIndex:0 });
  });
  it('quoted newline, delimiter and escaped quote remain in one cell', async () => {
    const parsed = await parseImportFile(file('A,B\n"a, b\n""c""",1'));
    expect(parsed.rows[0]!.values).toEqual(['a, b\n"c"','1']);
  });
  it.each(['A,A\n1,2','A,B\n"unterminated,1','A,B\n"x"oops,1','A,B\nx"x,1','A,B\n=SUM(A1),1','A,B\n@x,1','A,B\n+CMD,1','A,B\n-x,1','A,,B\n1,2,3','A,B\n1,2,3'])('invalid CSV is refused (%s)', async (text) => {
    await expect(parseImportFile(file(text))).rejects.toThrow();
  });
  it('invalid UTF8/oversized input fails closed', async () => {
    await expect(parseImportFile(ImportFileSchema.parse({ format:'CSV',contentBase64:Buffer.from([255,254,0]).toString('base64') }))).rejects.toThrow();
    expect(ImportFileSchema.safeParse({ format:'CSV',contentBase64:Buffer.alloc(524289).toString('base64') }).success).toBe(false);
  });
  it('real XLSX parser reads the guarded synthetic workbook', async () => {
    const bytes=zip(xlsx()); guardXlsx(bytes);
    const parsed=await parseImportFile(ImportFileSchema.parse({ format:'XLSX',contentBase64:bytes.toString('base64') }));
    expect(parsed.sheets).toEqual(['Jadwal']); expect(parsed.rows[0]!.values).toEqual(['Alias','1']);
  });
  it.each(['formula','external','macro','sparse','bomb','duplicate','duplicate-cell','duplicate-row','path','encrypted','truncated'])('XLSX %s rejected before parsing', (kind) => {
    let entries: Record<string, string>=xlsx(); let bytes: Buffer;
    if(kind==='formula') entries=xlsx('<row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row>');
    if(kind==='external') entries['xl/_rels/workbook.xml.rels']='<Relationship TargetMode="External"/>';
    if(kind==='macro') entries['xl/vbaProject.bin']='macro';
    if(kind==='sparse') entries=xlsx('<row r="999999"><c r="ZZ999999"><v>1</v></c></row>');
    if(kind==='bomb') entries['xl/test.xml']='x'.repeat(5*1024*1024);
    if(kind==='path') entries['../escape.xml']='x';
    if(kind==='duplicate-cell') entries=xlsx('<row r="1"><c r="A1"><v>1</v></c><c r="A1"><v>2</v></c></row>');
    if(kind==='duplicate-row') entries=xlsx('<row r="1"><c r="A1"><v>1</v></c></row><row r="1"><c r="B1"><v>2</v></c></row>');
    if(kind==='duplicate') entries['xl/workbook.xm1']=entries['xl/workbook.xml']!;
    bytes=zip(entries);
    if(kind==='duplicate') { const bad=Buffer.from('xl/workbook.xm1'), target=Buffer.from('xl/workbook.xml'); let at=bytes.indexOf(bad); while(at!==-1){target.copy(bytes,at);at=bytes.indexOf(bad,at+target.length);} }
    if(kind==='encrypted') bytes.writeUInt16LE(1,6);
    if(kind==='truncated') bytes=bytes.subarray(0,bytes.length-4);
    expect(() => guardXlsx(bytes)).toThrow();
  });
  it('XLSX styled trailing blank rows are rejected rather than silently trimmed', async()=>{
    const entries=xlsx();entries['xl/worksheets/sheet1.xml']=entries['xl/worksheets/sheet1.xml']!.replace('</sheetData>','<row r="3"><c r="A3" s="0"/></row></sheetData>');
    await expect(parseImportFile(ImportFileSchema.parse({format:'XLSX',contentBase64:zip(entries).toString('base64')}))).rejects.toThrow();
  });
  it.each([
    '<row r = "999999"><c r = "A999999"><v>1</v></c></row>',
    '<row r="1"><c r = "ZZ1"><v>1</v></c></row>',
    '<row r="&#49;"><c r="A&#49;"><v>1</v></c></row>',
    '<row><c r="A999999"><v>1</v></c></row>',
    '<row r="1"><c r="A01"><v>1</v></c></row>',
    '<row r="1"><c r="A1" x:r="ZZ999999"><v>1</v></c></row>',
    '<row r="1" x:r="999999"><c r="A1"><v>1</v></c></row>',
    '<row r = "1"><c r = "A1"><v>1</v></c></row>',
  ])('noncanonical/sparse XML references rejected before library allocation (%s)', (sheet) => {
    expect(() => guardXlsx(zip(xlsx(sheet)))).toThrow();
  });
  it('safe XML whitespace between attributes is supported', async()=>{
    const entries=xlsx();entries['xl/worksheets/sheet1.xml']=entries['xl/worksheets/sheet1.xml']!.replaceAll(' r="','\n  r="');
    expect(guardXlsx(zip(entries))).toEqual([2]);
    const parsed=await parseImportFile(ImportFileSchema.parse({format:'XLSX',contentBase64:zip(entries).toString('base64')}));
    expect(parsed.rows[0]!.values).toEqual(['Alias','1']);
  });
  it('all data rows accounted for; unresolved and duplicate rows cannot disappear', async () => {
    const parsed=await parseImportFile(file('A,B,C,D\nAlias,1,1,2\nMissing,1,3,4\nAlias,1,1,2'));
    const result=mapImportRows(parsed,mapping,input,[classId]);
    expect(result.slots).toHaveLength(2); expect(result.rowNumbers).toEqual([2,4]);
    expect(result.errors).toEqual([{row:3,code:'ASSIGNMENT_UNMAPPED',field:'assignment'}]);
    expect(result.slots.map((s) => s.sessionIndex)).toEqual([0,1]);
  });
  it('duplicate/unused aliases, reused/missing column and scope mismatch fail', async () => {
    expect(ImportMappingSchema.safeParse({ ...mapping, assignments:[...mapping.assignments,...mapping.assignments] }).success).toBe(false);
    expect(ImportMappingSchema.safeParse({ ...mapping, columns:{...mapping.columns, day:0} }).success).toBe(false);
    const parsed=await parseImportFile(file('A,B,C,D\nOther,1,1,2'));
    expect(mapImportRows(parsed,mapping,input,[classId]).errors.map((e)=>e.code)).toContain('UNUSED_ASSIGNMENT_MAPPING');
    expect(mapImportRows(parsed,mapping,input,[]).errors.map((e)=>e.code)).toContain('ASSIGNMENT_UNMAPPED');
  });
  it('strict import body cannot claim publication/approval', () => {
    expect(ImportPreviewSchema.safeParse({ published:true }).success).toBe(false);
  });
});
