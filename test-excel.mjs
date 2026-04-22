// Mock browser env minimal
import * as XLSX from 'xlsx-js-style';
import { writeFileSync } from 'fs';

const BUSINESS_INFO = { name: 'Hồ Thị Hoa', taxId: '079154014218', address: 'Chợ An Sương, 2421A đường Đỗ Mười, KP57', stall: 'Sạp số 61', phone: '0938774411' };

function getDaysInQuarter(q, year) {
  const startMonth = (q - 1) * 3;
  const days = [];
  for (let m = startMonth; m < startMonth + 3; m++) {
    const lastDay = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(`${year}-${String(m + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
    }
  }
  return days;
}

// Inline the function logic
const year = 2026;
const quarters = [1];
const isFullYear = false;
const rows = [];
rows.push([`Hộ kinh doanh: ${BUSINESS_INFO.name.toUpperCase()}`, '', '', 'Mẫu số S2a-HKD']);
rows.push([`Mã số thuế: ${BUSINESS_INFO.taxId}`, '', '', '(Kèm theo Thông tư số 152/2025/TT-BTC']);
rows.push([`Địa chỉ: ${BUSINESS_INFO.address}, ${BUSINESS_INFO.stall}`, '', '', 'ngày 31/12/2025 của Bộ Tài chính)']);
rows.push([`             Phường Đông Hưng Thuận, TP. Hồ Chí Minh`, '', '', '']);
rows.push([`Điện thoại: ${BUSINESS_INFO.phone}`, '', '', '']);
rows.push([`Ngành: 4719- Bán tạp hóa`, '', '', '']);
rows.push(['', '', '', '']);
rows.push(['SỔ CHI TIẾT DOANH THU BÁN HÀNG, DỊCH VỤ', '', '', '']);
rows.push([`Kỳ kê khai: Quý 1 năm 2026`, '', '', '(Đơn vị tính: VND)']);
rows.push(['Chứng từ', '', 'Diễn giải', 'Số tiền']);
rows.push(['Kí hiệu', 'Ngày, tháng', '', '']);
rows.push(['A', 'B', 'C', 1]);
rows.push(['', '', 'Ngành nghề: 4719- Bán tạp hóa', '']);
const dataStartRow = rows.length;
let grandTotal = 0;
const subtotalRowIdx = [];
let grandTotalRowIdx = -1;
for (const q of quarters) {
  const days = getDaysInQuarter(q, year);
  let qt = 0;
  for (const day of days) {
    const v = Math.floor(2000000 + Math.random()*2000000);
    qt += v;
    const [,mm,dd] = day.split('-');
    rows.push(['TM', `${dd}-${mm}`, 'Doanh thu tiền mặt bán lẻ', v]);
  }
  rows.push(['','','','']);
  rows.push(['','',`Tổng cộng (Quý ${q})`, qt]);
  subtotalRowIdx.push(rows.length-1);
  grandTotal += qt;
  if (!isFullYear || q < 4) rows.push(['','','','']);
}
const lastDataRow = rows.length - 1;
for (let i = 0; i < 5; i++) rows.push(['','','','']);
rows.push(['', '', `Ngày … tháng … năm ${year}`, '']);
const footerDateRow = rows.length-1;
rows.push(['', '', 'NGƯỜI ĐẠI DIỆN HỘ KINH DOANH/ CÁ NHÂN KINH DOANH', '']);
const footerRoleRow = rows.length-1;
rows.push(['', '', '(Ký, ghi rõ họ tên, đóng dấu (nếu có))', '']);
const footerSignRow = rows.length-1;

const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [{wch:43.78},{wch:29.33},{wch:35.78},{wch:38.66}];
ws['!rows'] = Array.from({length: rows.length}, (_,i) => {
  if (i===0) return {hpt:18}; if (i===1) return {hpt:17.45};
  if (i>=2 && i<=5) return {hpt:15.6};
  if (i===6) return {hpt:15}; if (i===7) return {hpt:29.45};
  if (i===8) return {hpt:17.45}; if (i===9) return {hpt:20.1};
  if (i===10) return {hpt:17.45}; if (i===11) return {hpt:21.95};
  if (i===12) return {hpt:18.6};
  return {hpt:15.6};
});
ws['!merges'] = [
  {s:{r:7,c:0},e:{r:7,c:3}},
  {s:{r:9,c:0},e:{r:9,c:1}},
  {s:{r:9,c:2},e:{r:10,c:2}},
  {s:{r:9,c:3},e:{r:10,c:3}},
  {s:{r:footerDateRow,c:2},e:{r:footerDateRow,c:3}},
  {s:{r:footerRoleRow,c:2},e:{r:footerRoleRow,c:3}},
  {s:{r:footerSignRow,c:2},e:{r:footerSignRow,c:3}},
];
const TNR = 'Times New Roman';
const ensure = a => { if(!ws[a]) ws[a]={v:'',t:'s'}; return ws[a]; };
const range = XLSX.utils.decode_range(ws['!ref']);
for (let R=range.s.r;R<=range.e.r;R++)for(let C=range.s.c;C<=range.e.c;C++){
  const a = XLSX.utils.encode_cell({r:R,c:C});
  if(!ws[a]) continue;
  ws[a].s = {font:{name:TNR,sz:12},alignment:{vertical:'center',horizontal:'center'}};
}
ensure('A1').s={font:{name:TNR,sz:14},alignment:{vertical:'center',horizontal:'left'}};
ensure('D1').s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'left'}};
for (const R of [1,2]) {
  const aA=XLSX.utils.encode_cell({r:R,c:0}); const dA=XLSX.utils.encode_cell({r:R,c:3});
  if(ws[aA]) ws[aA].s={font:{name:TNR,sz:12},alignment:{vertical:'center',horizontal:'left'}};
  if(ws[dA]) ws[dA].s={font:{name:TNR,sz:12},alignment:{vertical:'center',horizontal:'left'}};
}
for (const R of [3,4,5]) { const a=XLSX.utils.encode_cell({r:R,c:0}); if(ws[a]) ws[a].s={font:{name:TNR,sz:12},alignment:{vertical:'center',horizontal:'left'}}; }
ensure('A8').s={font:{name:TNR,sz:20,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure('A9').s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'left'}};
ensure('D9').s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'left'}};
ensure('A10').s={font:{name:TNR,sz:16,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure('C10').s={font:{name:TNR,sz:16,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure('D10').s={font:{name:TNR,sz:16,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure('A11').s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure('B11').s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'center'}};
for (const C of [0,1,2,3]){const a=XLSX.utils.encode_cell({r:11,c:C});ensure(a).s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'center'}};}
ensure('C13').s={font:{name:TNR,sz:12,bold:true},alignment:{vertical:'center',horizontal:'left'}};
for (let R=dataStartRow;R<=lastDataRow;R++){
  const isSub = subtotalRowIdx.includes(R); const isGrand = R===grandTotalRowIdx;
  for (let C=0;C<=3;C++){
    const a=XLSX.utils.encode_cell({r:R,c:C});
    if(!ws[a]) continue;
    const sz = (isSub||isGrand)?14:12; const bold = isSub||isGrand;
    ws[a].s={font:{name:TNR,sz,bold},alignment:{vertical:'center',horizontal:'center'}};
    if(C===3 && typeof ws[a].v==='number'){ws[a].z='#,##0';ws[a].s.numFmt='#,##0';}
  }
}
ensure(XLSX.utils.encode_cell({r:footerDateRow,c:2})).s={font:{name:TNR,sz:12},alignment:{vertical:'center',horizontal:'center'}};
ensure(XLSX.utils.encode_cell({r:footerRoleRow,c:2})).s={font:{name:TNR,sz:14,bold:true},alignment:{vertical:'center',horizontal:'center'}};
ensure(XLSX.utils.encode_cell({r:footerSignRow,c:2})).s={font:{name:TNR,sz:12,italic:true},alignment:{vertical:'center',horizontal:'center'}};

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, `S2a-HKD ${year}`);
XLSX.writeFile(wb, '/tmp/test-output.xlsx', {cellStyles:true});
console.log('OK lastDataRow=', lastDataRow, 'totalRows=', rows.length);
