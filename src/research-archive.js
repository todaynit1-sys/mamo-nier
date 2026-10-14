/* ZIP STORE writer: no external services, compression, or source-file uploads. */
(() => {
  'use strict';
  const encoder = new TextEncoder();
  const table = Uint32Array.from({length:256}, (_, value) => {
    for (let i=0;i<8;i++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function crc32(bytes) {
    let value=0xffffffff;
    for (const byte of bytes) value=table[(value ^ byte) & 255] ^ (value >>> 8);
    return (value ^ 0xffffffff) >>> 0;
  }
  async function zip(files, date=new Date()) {
    if (files.length>65535) throw new Error('저장할 파일 수가 너무 많습니다.');
    const names=new Set(), local=[], central=[];
    let offset=0, centralSize=0;
    const year=Math.min(2107,Math.max(1980,date.getFullYear()));
    const dosDate=((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2);
    for (const file of files) {
      if (!file.name || /[\\/\x00]/.test(file.name) || file.name==='.' || file.name==='..' || names.has(file.name)) throw new Error('저장 파일명이 유효하지 않습니다.');
      names.add(file.name);
      const name=encoder.encode(file.name);
      const bytes=file.data instanceof Blob ? new Uint8Array(await file.data.arrayBuffer()) : encoder.encode(String(file.data));
      if (name.length>65535 || bytes.length>0xffffffff || offset+30+name.length+bytes.length>0xffffffff) throw new Error('ZIP 출력 크기가 너무 큽니다. 파일을 개별 저장하세요.');
      const crc=crc32(bytes);
      const header=new Uint8Array(30+name.length), hv=new DataView(header.buffer);
      hv.setUint32(0,0x04034b50,true);hv.setUint16(4,20,true);hv.setUint16(6,0x800,true);
      hv.setUint16(10,dosTime,true);hv.setUint16(12,dosDate,true);hv.setUint32(14,crc,true);
      hv.setUint32(18,bytes.length,true);hv.setUint32(22,bytes.length,true);hv.setUint16(26,name.length,true);header.set(name,30);
      const entry=new Uint8Array(46+name.length), ev=new DataView(entry.buffer);
      ev.setUint32(0,0x02014b50,true);ev.setUint16(4,20,true);ev.setUint16(6,20,true);ev.setUint16(8,0x800,true);
      ev.setUint16(12,dosTime,true);ev.setUint16(14,dosDate,true);ev.setUint32(16,crc,true);
      ev.setUint32(20,bytes.length,true);ev.setUint32(24,bytes.length,true);ev.setUint16(28,name.length,true);
      ev.setUint32(42,offset,true);entry.set(name,46);
      local.push(header,bytes);central.push(entry);
      offset+=header.length+bytes.length;centralSize+=entry.length;
    }
    if (offset+centralSize+22>0xffffffff) throw new Error('ZIP 출력 크기가 너무 큽니다. 파일을 개별 저장하세요.');
    const end=new Uint8Array(22), view=new DataView(end.buffer);
    view.setUint32(0,0x06054b50,true);view.setUint16(8,files.length,true);view.setUint16(10,files.length,true);
    view.setUint32(12,centralSize,true);view.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }
  globalThis.MamoArchive={zip};
})();
