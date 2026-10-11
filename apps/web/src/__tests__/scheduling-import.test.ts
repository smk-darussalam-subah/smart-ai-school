import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ImportAckSchema, ImportResultSchema, importRequest, importIssueText } from '@/lib/scheduling-import';
import SchedulingImportPanel from '@/app/dashboard/jadwal/_components/SchedulingImportPanel';

const mockFetch = jest.fn();
const id='84000000-0000-4000-8000-000000000010';
describe('Scheduling import UI contract',()=>{
  beforeEach(()=>{global.fetch=mockFetch;mockFetch.mockReset();});
  it('uses the session proxy and preserves idempotency key without spoofed identity',async()=>{
    mockFetch.mockResolvedValue({ok:true,json:async()=>({id,revision:0,status:'DRAFT',acknowledgmentOnly:true,published:false,replayed:false})});
    const result=await importRequest('commit',{fixture:true},ImportAckSchema,'synthetic-key');
    expect(result.published).toBe(false);
    expect(mockFetch).toHaveBeenCalledWith('/api/backend/scheduling/imports/commit',expect.objectContaining({
      headers:{'Content-Type':'application/json','idempotency-key':'synthetic-key'},credentials:'same-origin',cache:'no-store'}));
  });
  it.each([400,401,403,409,413,500,503])('HTTP %s is never shown as a saved draft',async(status)=>{
    mockFetch.mockResolvedValue({ok:false,status,json:async()=>({secret:'must-not-display'})});
    await expect(importRequest('commit',{},ImportAckSchema,'synthetic-key')).rejects.toThrow();
  });
  it('malformed or published acknowledgment is refused',async()=>{
    mockFetch.mockResolvedValue({ok:true,json:async()=>({id,published:true})});
    await expect(importRequest('commit',{},ImportAckSchema,'synthetic-key')).rejects.toThrow('diverifikasi');
  });
  it('network failure remains a rejected request',async()=>{
    mockFetch.mockRejectedValue(new Error('synthetic offline'));
    await expect(importRequest('preview',{},ImportResultSchema)).rejects.toThrow();
  });
  it('closed dialog mounts no hidden form and makes no requests before the user opens it',()=>{
    const html=renderToStaticMarkup(React.createElement(SchedulingImportPanel,{academicYearId:id,semesterNumber:1,classes:[{id,name:'X Sintetis'}],canEdit:true,open:false,onOpenChange:jest.fn()}));
    expect(html).not.toContain('type="file"'); expect(html).not.toContain('Simpan sebagai draft');
    expect(html).not.toContain('Publikasikan'); expect(html).not.toContain('Generate');
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it('error language does not call partial allocation feasible',()=>{
    expect(importIssueText('ASSIGNMENT_JP_INCOMPLETE')).toContain('belum lengkap');
    expect(importIssueText('CLASS_OVERLAP')).toContain('dua sesi');
  });
});
