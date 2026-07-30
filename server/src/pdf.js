'use strict';
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const NAVY = '#0B1F3A';
const BLUE = '#3B82F6';
const SLATE = '#64748B';
const LINE = '#E6EBF2';

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function ageLabel(dob) {
  if (!dob) return '—';
  const b = new Date(dob), n = new Date();
  let months = (n.getFullYear() - b.getFullYear()) * 12 + (n.getMonth() - b.getMonth());
  if (n.getDate() < b.getDate()) months--;
  const y = Math.floor(months / 12), m = months % 12;
  return `${y}y ${m}m`;
}
function latest(child, domain) {
  const s = child.progress && child.progress[domain];
  return s && s.length ? s[s.length - 1].value : 0;
}

// Generate a PDF Buffer for a fully-assembled (staff-shape) child object.
function generateReport(child, clinic, opts = {}) {
  return new Promise((resolve, reject) => {
    try {
      const DOMAINS = opts.domains || Object.keys(child.progress || {});
      const therapistName = opts.therapistName || 'Treating Therapist';
      const therapistTitle = opts.therapistTitle || '';
      const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
      const chunks = [];
      doc.on('data', (d) => chunks.push(d));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const W = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const L = doc.page.margins.left;

      // Brand mark (navy on white paper). Optional — header still renders without it.
      const LOGO = path.join(__dirname, '..', '..', 'public', 'assets', 'logo-mark-navy.png');
      const hasLogo = fs.existsSync(LOGO);

      // ---- header ----
      const header = () => {
        doc.rect(L, 40, W, 4).fill(NAVY);
        const tx = hasLogo ? L + 58 : L;           // shift text right when the logo is present
        if (hasLogo) {
          try { doc.image(LOGO, L, 52, { fit: [46, 46] }); } catch (_) {}
        }
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16).text(clinic.name || 'Clinic', tx, 54);
        doc.font('Helvetica').fontSize(9).fillColor(SLATE)
          .text(clinic.tagline || '', tx, 74)
          .text(`${clinic.address || ''}  ·  ${clinic.phone || ''}  ·  ${clinic.email || ''}`, tx, 86);
        doc.moveTo(L, 104).lineTo(L + W, 104).strokeColor(LINE).stroke();
        doc.y = 116;
      };
      const sectionTitle = (t) => {
        if (doc.y > 720) doc.addPage();
        doc.moveDown(0.6);
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(t);
        doc.moveTo(L, doc.y + 2).lineTo(L + 60, doc.y + 2).strokeColor(BLUE).lineWidth(2).stroke();
        doc.moveDown(0.6);
        doc.lineWidth(1);
      };
      const kv = (pairs) => {
        doc.font('Helvetica').fontSize(10).fillColor('#1f2937');
        const colW = W / 2;
        let i = 0;
        for (const [k, v] of pairs) {
          const x = L + (i % 2) * colW;
          const y = doc.y;
          doc.fillColor(SLATE).font('Helvetica').fontSize(8).text(String(k).toUpperCase(), x, y, { width: colW - 12 });
          doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10).text(v == null ? '—' : String(v), x, y + 10, { width: colW - 12 });
          if (i % 2 === 1) doc.moveDown(1.6);
          i++;
        }
        if (i % 2 === 1) doc.moveDown(1.6);
        doc.moveDown(0.2);
      };
      const bar = (label, pct) => {
        const y = doc.y;
        const barX = L + 160, barW = W - 210;
        doc.font('Helvetica').fontSize(9).fillColor('#334155').text(label, L, y + 1, { width: 150 });
        doc.roundedRect(barX, y + 1, barW, 9, 4).fill('#EEF2F7');
        const w = Math.max(2, (pct / 100) * barW);
        doc.roundedRect(barX, y + 1, w, 9, 4).fill(BLUE);
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(`${pct}%`, barX + barW + 6, y, { width: 34 });
        doc.y = y + 15;
      };

      header();

      const overallVals = DOMAINS.map((d) => latest(child, d));
      const overall = overallVals.length ? Math.round(overallVals.reduce((a, b) => a + b, 0) / overallVals.length) : 0;

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(18).text('Pediatric Therapy Progress Report', { align: 'left' });
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor(SLATE)
        .text(`Printed ${fmtDate(new Date())}   ·   Ref LPT-${String(child.id).slice(0, 8).toUpperCase()}`);

      sectionTitle('Child Information');
      kv([
        ['Full name', child.name],
        ['Date of birth', fmtDate(child.dob)],
        ['Age', ageLabel(child.dob)],
        ['Gender', child.gender],
        ['Primary diagnosis', child.diagnosis],
        ['Referral source', child.referral],
        ['Treating therapist', therapistName],
        ['Parent / guardian', child.parentName || '—'],
        ['Parent email', child.parentEmail || '—'],
        ['In therapy since', fmtDate(child.startDate)],
      ]);

      sectionTitle('Clinical Summary');
      const first = child.name.split(' ')[0];
      doc.font('Helvetica').fontSize(10).fillColor('#1f2937').text(
        `${first} is a ${ageLabel(child.dob)} old ${(child.gender || '').toLowerCase()} presenting with ${(child.diagnosis || '').toLowerCase()}, ` +
        `receiving regular therapy under ${therapistName}. Across ${child.sessions ? child.sessions.length : 0} documented sessions, ` +
        `${first} has demonstrated an overall developmental attainment of ${overall}% across the ${DOMAINS.length} assessed domains. ` +
        `Engagement in structured activities continues to develop, with the family supported through home programmes.`,
        { align: 'left', lineGap: 2 }
      );

      if (child.tools && child.tools.length) {
        sectionTitle('Standardised Assessments');
        doc.font('Helvetica').fontSize(9);
        child.tools.forEach((t) => {
          const y = doc.y;
          doc.fillColor(NAVY).font('Helvetica-Bold').text(t.code || '—', L, y, { width: 60 });
          doc.fillColor('#1f2937').font('Helvetica').text(t.name || '', L + 64, y, { width: W - 200 });
          doc.fillColor('#334155').text(t.result || '—', L + W - 130, y, { width: 90 });
          doc.fillColor(SLATE).fontSize(8).text(fmtDate(t.date), L + W - 40, y, { width: 40 });
          doc.fontSize(9);
          doc.moveDown(0.7);
        });
      }

      sectionTitle('Developmental Progress');
      DOMAINS.forEach((d) => bar(d, latest(child, d)));

      sectionTitle('Therapy Timeline (recent sessions)');
      const recent = (child.sessions || []).slice(0, 8);
      if (recent.length) {
        doc.font('Helvetica').fontSize(9);
        recent.forEach((s) => {
          const y = doc.y;
          doc.fillColor(NAVY).font('Helvetica-Bold').text(fmtDate(s.date), L, y, { width: 70 });
          doc.fillColor('#1f2937').font('Helvetica').text((s.goalsWorked || []).join(', ') || 'General session', L + 74, y, { width: W - 150 });
          doc.fillColor(SLATE).text(`${s.duration || '—'} min`, L + W - 60, y, { width: 60 });
          doc.moveDown(0.6);
          if (doc.y > 740) doc.addPage(), header();
        });
      } else {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text('No sessions documented yet.');
      }

      const activeGoals = (child.goals || []).filter((g) => g.status === 'active');
      const achieved = (child.goals || []).filter((g) => g.status === 'achieved');
      sectionTitle('Goals — In Progress');
      if (activeGoals.length) {
        doc.font('Helvetica').fontSize(9);
        activeGoals.forEach((g) => {
          const y = doc.y;
          doc.fillColor('#1f2937').font('Helvetica').text(g.title, L, y, { width: W - 160 });
          doc.fillColor(SLATE).text(g.domain || '', L + W - 150, y, { width: 100 });
          doc.fillColor(NAVY).font('Helvetica-Bold').text(`${g.progress}%`, L + W - 44, y, { width: 44 });
          doc.moveDown(0.5);
          if (doc.y > 740) doc.addPage(), header();
        });
      } else {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text('No active goals.');
      }
      if (achieved.length) {
        sectionTitle('Goals — Achieved');
        doc.font('Helvetica').fontSize(9).fillColor('#1f2937');
        achieved.forEach((g) => { doc.text(`• ${g.title}  (${g.domain || ''})`); });
      }

      const activeHP = (child.homeProgrammes || []).filter((h) => h.status === 'active');
      sectionTitle('Current Home Programme');
      if (activeHP.length) {
        activeHP.forEach((h, i) => {
          if (doc.y > 720) doc.addPage(), header();
          doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(`${i + 1}. ${h.t}  `, { continued: true })
            .fillColor(SLATE).font('Helvetica').fontSize(9).text(`— ${h.freq || ''}`);
          doc.fillColor('#334155').font('Helvetica').fontSize(9).text(h.instr || '', { lineGap: 1 });
          doc.fillColor(SLATE).fontSize(8).text(`Materials: ${h.mat || '—'}   ·   Outcome: ${h.out || '—'}`);
          doc.moveDown(0.6);
        });
      } else {
        doc.font('Helvetica').fontSize(9).fillColor(SLATE).text('No active home programme.');
      }

      sectionTitle('Therapist Recommendations');
      const focus = activeGoals.slice(0, 2).map((g) => (g.domain || '').toLowerCase()).filter(Boolean).join(' and ') || 'core developmental goals';
      doc.font('Helvetica').fontSize(10).fillColor('#1f2937').text(
        `It is recommended that ${first} continue regular therapy with a focus on ${focus}. ` +
        `Consistent completion of the home programme is encouraged to reinforce gains between sessions. ` +
        `Progress will be reviewed at the next scheduled assessment.`,
        { lineGap: 2 }
      );

      doc.moveDown(1.5);
      if (doc.y > 720) doc.addPage(), header();
      const sy = doc.y;
      doc.moveTo(L, sy + 24).lineTo(L + 200, sy + 24).strokeColor('#94A3B8').stroke();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(therapistName, L, sy + 28);
      doc.fillColor(SLATE).font('Helvetica').fontSize(9).text(therapistTitle || 'Treating Therapist', L, sy + 44);
      doc.fillColor(SLATE).text(`Date: ${fmtDate(new Date())}`, L + 260, sy + 44);

      // page numbers + confidentiality footer
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        doc.fillColor(SLATE).font('Helvetica').fontSize(8)
          .text(`LPT Connect · Confidential clinical report`, L, 812, { width: W / 2 })
          .text(`Page ${i + 1} of ${range.count}`, L + W / 2, 812, { width: W / 2, align: 'right' });
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateReport };
