// ═══════════════════════════════════════════════════════════════════════
// Indiana Expungement Assistant — Complete In-Browser Court Document Engine
// Strictly compliant with Indiana Trial Rule 10 & Document Formatting Guide:
// - Page Layout: Standard 8.5 x 11 inches (612 x 792 pt)
// - Margins: At least 1-inch (72 pt) margins on all four sides (top, bottom, left, right)
// - Typography: 12-point or larger, strictly black (#000000), Times New Roman
// - Spacing: Double-spaced body text (24 pt line height), single-spaced tables/captions
// - Pagination: Consecutively numbered at the bottom of the page, starting with 1
// - Caption Structure: Exact court name, title of action, cause number, Rule 7(A) designation
// - Interactive Form Fields: All blank/unanswered fields are fillable for manual completion
// ═══════════════════════════════════════════════════════════════════════

import { getCountyInfo, STATEWIDE_AGENCIES } from './county-directory.js';

class PdfContext {
  constructor(pdfDoc, fonts, colors) {
    this.pdfDoc = pdfDoc;
    this.form = pdfDoc.getForm();
    this.fonts = fonts;
    this.colors = colors;
    this.currentPage = null;
    this.pageWidth = 612;
    this.pageHeight = 792;
    // Exactly 1-inch (72 pt) margins on all sides
    this.leftMargin = 72;
    this.rightMargin = 540; // 612 - 72 = 540
    this.contentWidth = 468; // 540 - 72 = 468
    this.topMargin = 72;
    this.bottomMargin = 72;
    this.cursorY = 720; // 792 - 72 = 720
    this.fieldCounter = {};
    this.documents = [];
    this.currentDocName = '';
    this.docStartPageIndex = 0;
  }

  startDocument(docName) {
    this.currentDocName = docName;
    this.docStartPageIndex = this.pdfDoc.getPageCount();
  }

  endDocument() {
    const totalPages = this.pdfDoc.getPageCount();
    const count = totalPages - this.docStartPageIndex;
    if (count > 0) {
      this.documents.push({
        name: this.currentDocName,
        startIndex: this.docStartPageIndex,
        endIndex: totalPages - 1,
        pageCount: count
      });
    }
  }

  addPage() {
    this.currentPage = this.pdfDoc.addPage();
    this.currentPage.setSize(this.pageWidth, this.pageHeight);
    this.cursorY = 720;
    return this.currentPage;
  }

  ensureSpace(neededHeight) {
    if (this.cursorY - neededHeight < this.bottomMargin) {
      this.addPage();
    }
  }

  getUniqueFieldName(baseName) {
    if (!this.fieldCounter[baseName]) {
      this.fieldCounter[baseName] = 1;
      return baseName;
    }
    this.fieldCounter[baseName]++;
    return `${baseName}_${this.fieldCounter[baseName]}`;
  }

  cleanText(text) {
    if (text == null) return '';
    return String(text).replace(/[^\x00-\x7F\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u00A7]/g, ' ');
  }

  wrapText(text, font, size, maxWidth) {
    const clean = this.cleanText(text);
    if (!clean) return [];
    const paragraphs = clean.split('\n');
    const allLines = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        allLines.push('');
        continue;
      }
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) allLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) allLines.push(currentLine);
    }
    return allLines;
  }

  drawText(text, x, y, size = 12, fontType = 'regular', color = this.colors.black) {
    const font = this.fonts[fontType] || this.fonts.regular;
    const clean = this.cleanText(text);
    this.currentPage.drawText(clean, {
      x,
      y,
      size,
      font,
      color,
    });
  }

  drawCenteredText(text, y, size = 12, fontType = 'bold', color = this.colors.black) {
    const font = this.fonts[fontType] || this.fonts.bold;
    const clean = this.cleanText(text);
    if (!clean) return;
    const textWidth = font.widthOfTextAtSize(clean, size);
    const x = Math.max(this.leftMargin, (this.pageWidth - textWidth) / 2);
    this.drawText(clean, x, y, size, fontType, color);
  }

  drawLine(startX, startY, endX, endY, thickness = 0.75, color = this.colors.black) {
    this.currentPage.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      thickness,
      color,
    });
  }

  drawRectangle(x, y, width, height, fillColor = null, borderColor = this.colors.black, borderWidth = 0.5) {
    const options = { x, y, width, height };
    if (fillColor) options.color = fillColor;
    if (borderColor) {
      options.borderColor = borderColor;
      options.borderWidth = borderWidth;
    }
    this.currentPage.drawRectangle(options);
  }

  // Interactive PDF Form Field helpers
  addTextField(name, x, y, width, height, defaultValue = '', { fontSize = 11, fontType = 'regular', isMultiline = false } = {}) {
    try {
      const fieldName = this.getUniqueFieldName(name);
      const tf = this.form.createTextField(fieldName);
      tf.addToPage(this.currentPage, {
        x,
        y,
        width,
        height,
        textColor: this.colors.black,
        borderColor: this.colors.fieldBorder,
        borderWidth: 0.5,
        backgroundColor: this.colors.fieldBg
      });
      tf.setFontSize(fontSize);
      if (isMultiline) tf.enableMultiline();
      if (defaultValue) {
        tf.setText(this.cleanText(defaultValue));
      }
      return tf;
    } catch (e) {
      console.warn('Could not add text field:', name, e);
      return null;
    }
  }

  addCheckBox(name, x, y, width = 12, height = 12, isChecked = false) {
    try {
      const fieldName = this.getUniqueFieldName(name);
      const cb = this.form.createCheckBox(fieldName);
      cb.addToPage(this.currentPage, {
        x,
        y,
        width,
        height,
        borderColor: this.colors.black,
        borderWidth: 0.75
      });
      if (isChecked) cb.check();
      return cb;
    } catch (e) {
      console.warn('Could not add checkbox:', name, e);
      return null;
    }
  }

  // ── Caption Structure (Trial Rule 10) ──
  drawCaption(payload, rule7ADesignation = 'XP - EXPUNGEMENT PETITION') {
    this.ensureSpace(180);
    const county = (payload.county || 'MARION').toUpperCase();
    const court = (payload.court || 'CIRCUIT / SUPERIOR COURT').toUpperCase();
    const courtCode = payload.courtCode || '49D01';
    const petName = (payload.petitioner?.fullName || 'PETITIONER').toUpperCase();
    const aliases = payload.petitioner?.aliases ? `a/k/a ${payload.petitioner.aliases}` : '';

    const startY = this.cursorY;

    // Right Column: Exact Name of Court, Cause No., Rule 7(A) Designation
    const courtClean = court.toUpperCase();
    const courtTitle = courtClean.startsWith('IN ') ? courtClean : `IN THE ${courtClean}`;
    const courtLines = this.wrapText(courtTitle, this.fonts.bold, 11, 230);

    let rightY = startY;
    for (const cl of courtLines) {
      this.drawText(cl, 305, rightY, 11, 'bold');
      rightY -= 15;
    }
    rightY -= 6;
    this.drawText('CAUSE NO.', 305, rightY, 11, 'bold');
    // Interactive fillable Cause Number field
    this.addTextField('causeNumber', 375, rightY - 4, 165, 18, `${courtCode}-____-XP-______`, { fontSize: 10 });
    rightY -= 26;
    this.drawText(rule7ADesignation, 305, rightY, 9.5, 'bold');

    // Left Column: State/County, In Re, and Petitioner with Indiana parenthesis divider column
    let leftY = startY;
    this.drawText('STATE OF INDIANA', 72, leftY, 11.5, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 16;

    this.drawText(`COUNTY OF ${county}`, 72, leftY, 11.5, 'bold');
    this.drawText(')  SS:', 275, leftY, 11, 'regular');
    leftY -= 22;

    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 6;

    this.drawText('IN RE THE EXPUNGEMENT OF', 72, leftY, 10.5, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 15;

    this.drawText('THE ARREST AND CONVICTION', 72, leftY, 10.5, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 15;

    this.drawText('RECORDS OF:', 72, leftY, 10.5, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 20;

    this.drawText(`${petName},`, 72, leftY, 11.5, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 15;

    if (aliases) {
      this.drawText(aliases, 84, leftY, 9.5, 'italic');
      this.drawText(')', 275, leftY, 12, 'regular');
      leftY -= 14;
    }

    this.drawText('       Petitioner.', 72, leftY, 11, 'bold');
    this.drawText(')', 275, leftY, 12, 'regular');
    leftY -= 12;

    const bottomY = Math.min(leftY, rightY - 12);
    this.drawLine(72, bottomY, 540, bottomY, 1, this.colors.black);
    this.cursorY = bottomY - 20;
  }

  drawTitleBlock(title, subtitle = '') {
    // Multi-line wrapping within 1-inch margins (448 pt max text width)
    const titleLines = this.wrapText(title, this.fonts.bold, 12.5, this.contentWidth - 20);
    const subtitleLines = subtitle ? this.wrapText(subtitle, this.fonts.italic, 10, this.contentWidth - 20) : [];
    const totalNeeded = (titleLines.length * 16) + (subtitleLines.length * 14) + 16;
    this.ensureSpace(totalNeeded);

    for (const line of titleLines) {
      this.drawCenteredText(line, this.cursorY, 12.5, 'bold');
      this.cursorY -= 16;
    }
    this.cursorY -= 2;
    for (const line of subtitleLines) {
      this.drawCenteredText(line, this.cursorY, 10, 'italic');
      this.cursorY -= 13;
    }
    this.cursorY -= 8;
  }

  drawHeading(heading) {
    this.ensureSpace(28);
    this.drawText(heading, 72, this.cursorY, 12, 'bold');
    this.cursorY -= 18;
  }

  // Double-spaced body paragraph per Trial Rule 10 (lineHeight = 24pt for 12pt font)
  drawDoubleSpacedParagraph(text, { indent = 0, extraSpacing = 8 } = {}) {
    const font = this.fonts.regular;
    const size = 12;
    const lineHeight = 24; // Double spaced
    const maxWidth = this.contentWidth - indent;
    const lines = this.wrapText(text, font, size, maxWidth);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.drawText(line, 72 + indent, this.cursorY, size, 'regular');
      this.cursorY -= lineHeight;
    }
    this.cursorY -= extraSpacing;
  }

  // Single-spaced paragraph for exceptions (tables, charts, block quotes, certificates)
  drawSingleSpacedParagraph(text, { size = 11, fontType = 'regular', indent = 0, extraSpacing = 6 } = {}) {
    const font = this.fonts[fontType] || this.fonts.regular;
    const lineHeight = size * 1.35;
    const maxWidth = this.contentWidth - indent;
    const lines = this.wrapText(text, font, size, maxWidth);

    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.drawText(line, 72 + indent, this.cursorY, size, fontType);
      this.cursorY -= lineHeight;
    }
    this.cursorY -= extraSpacing;
  }

  drawBullet(text, indent = 14) {
    const font = this.fonts.regular;
    const size = 12;
    const lineHeight = 20; // Slightly compact for numbered/bulleted pleading paragraphs
    const maxWidth = this.contentWidth - indent - 12;
    const lines = this.wrapText(text, font, size, maxWidth);

    if (lines.length > 0) {
      this.ensureSpace(lineHeight);
      this.drawText('•', 72 + indent, this.cursorY, size, 'bold');
      this.drawText(lines[0], 72 + indent + 12, this.cursorY, size, 'regular');
      this.cursorY -= lineHeight;

      for (let i = 1; i < lines.length; i++) {
        this.ensureSpace(lineHeight);
        this.drawText(lines[i], 72 + indent + 12, this.cursorY, size, 'regular');
        this.cursorY -= lineHeight;
      }
    }
    this.cursorY -= 4;
  }

  // Single-spaced Key-Value Table with interactive fillable text fields for missing data
  drawInteractiveKeyValueTable(pairs, keyWidth = 145) {
    const totalWidth = this.contentWidth;
    const valWidth = totalWidth - keyWidth;
    const rowHeight = 22;
    const tableHeight = pairs.length * rowHeight;
    this.ensureSpace(tableHeight + 8);

    let y = this.cursorY;
    for (let i = 0; i < pairs.length; i++) {
      const [key, val, fieldName] = pairs[i];
      const rowY = y - (i * rowHeight);

      // Cell borders
      this.drawRectangle(72, rowY - rowHeight, keyWidth, rowHeight, this.colors.tableHeaderBg, this.colors.black, 0.5);
      this.drawRectangle(72 + keyWidth, rowY - rowHeight, valWidth, rowHeight, null, this.colors.black, 0.5);

      this.drawText(key, 76, rowY - 15, 10, 'bold');

      if (fieldName) {
        // Interactive fillable text field
        this.addTextField(fieldName, 72 + keyWidth + 4, rowY - rowHeight + 2, valWidth - 8, rowHeight - 4, val || '', { fontSize: 10 });
      } else {
        this.drawText(String(val || ''), 72 + keyWidth + 6, rowY - 15, 10, 'regular');
      }
    }
    this.cursorY = y - tableHeight - 12;
  }

  drawTable(headers, rows, colWidths) {
    const rowHeight = 20;
    const totalHeight = (rows.length + 1) * rowHeight;
    this.ensureSpace(Math.min(totalHeight, 120));

    // Header row
    let xOffset = 72;
    this.drawRectangle(72, this.cursorY - rowHeight, this.contentWidth, rowHeight, this.colors.tableHeaderBg, this.colors.black, 0.75);
    for (let c = 0; c < headers.length; c++) {
      this.drawText(headers[c], xOffset + 4, this.cursorY - 14, 9, 'bold');
      xOffset += colWidths[c];
    }
    this.cursorY -= rowHeight;

    // Data rows
    for (let r = 0; r < rows.length; r++) {
      this.ensureSpace(rowHeight);
      xOffset = 72;
      const bg = r % 2 === 1 ? this.colors.tableHeaderBg : null;
      this.drawRectangle(72, this.cursorY - rowHeight, this.contentWidth, rowHeight, bg, this.colors.black, 0.5);
      for (let c = 0; c < rows[r].length; c++) {
        let cellText = String(rows[r][c] || '');
        const maxCellW = colWidths[c] - 8;
        while (cellText.length > 3 && this.fonts.regular.widthOfTextAtSize(cellText, 8.5) > maxCellW) {
          cellText = cellText.slice(0, -4) + '...';
        }
        this.drawText(cellText, xOffset + 4, this.cursorY - 14, 8.5, 'regular');
        xOffset += colWidths[c];
      }
      this.cursorY -= rowHeight;
    }
    this.cursorY -= 10;
  }

  drawInteractiveGridTable(headers, rows, colWidths, fieldPrefix) {
    const rowHeight = 22;
    const totalHeight = (rows.length + 1) * rowHeight;
    this.ensureSpace(Math.min(totalHeight, 120));

    // Header row
    let xOffset = 72;
    this.drawRectangle(72, this.cursorY - rowHeight, this.contentWidth, rowHeight, this.colors.tableHeaderBg, this.colors.black, 0.75);
    for (let c = 0; c < headers.length; c++) {
      this.drawText(headers[c], xOffset + 4, this.cursorY - 15, 9, 'bold');
      xOffset += colWidths[c];
    }
    this.cursorY -= rowHeight;

    // Data rows
    for (let r = 0; r < rows.length; r++) {
      this.ensureSpace(rowHeight);
      xOffset = 72;
      const bg = r % 2 === 1 ? this.colors.tableHeaderBg : null;
      this.drawRectangle(72, this.cursorY - rowHeight, this.contentWidth, rowHeight, bg, this.colors.black, 0.5);
      
      for (let c = 0; c < rows[r].length; c++) {
        let cellText = String(rows[r][c] || '');
        if (c === 0) {
          // Column 0 is static row number
          this.drawText(cellText, xOffset + 4, this.cursorY - 15, 9, 'regular');
        } else {
          // Interactive field
          this.addTextField(`${fieldPrefix}_r${r}_c${c}`, xOffset + 2, this.cursorY - rowHeight + 2, colWidths[c] - 4, rowHeight - 4, cellText, { fontSize: 8.5 });
        }
        xOffset += colWidths[c];
      }
      this.cursorY -= rowHeight;
    }
    this.cursorY -= 12;
  }

  drawSignatureBlock(nameUpper, title = 'Petitioner Pro Se', fieldPrefix = 'sig') {
    this.ensureSpace(95);
    this.drawText('Respectfully submitted,', 72, this.cursorY, 12, 'regular');
    this.cursorY -= 36; // Blank vertical space for ink signature

    if (this.isEsign) {
      this.drawText(`/s/ ${nameUpper}`, 72, this.cursorY + 6, 11, 'italic');
    }

    // Physical signature line (strictly blank for physical handwritten signature unless e-signed)
    this.drawLine(72, this.cursorY, 320, this.cursorY, 0.75, this.colors.black);

    // Printed name and title underneath the line
    this.drawText(nameUpper, 72, this.cursorY - 14, 11, 'bold');
    this.drawText(title, 72, this.cursorY - 26, 10, 'regular');

    // Date line with optional fillable text field
    this.drawText('Date:', 72, this.cursorY - 46, 11, 'regular');
    this.drawLine(108, this.cursorY - 46, 250, this.cursorY - 46, 0.5, this.colors.black);
    
    if (this.isEsign) {
      const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      this.drawText(today, 112, this.cursorY - 44, 11, 'regular');
    } else {
      this.addTextField(`${fieldPrefix}_date`, 108, this.cursorY - 50, 142, 18, '', { fontSize: 10 });
    }
    
    this.cursorY -= 64;
  }

  drawPerjuryAffirmation(nameUpper, fieldPrefix = 'verif') {
    this.ensureSpace(120);
    this.drawHeading('AFFIRMATION UNDER PENALTIES FOR PERJURY (T.R. 11)');
    this.drawDoubleSpacedParagraph(
      'I affirm, under the penalties for perjury, that the foregoing representations, factual statements, ' +
      'and exhibits set forth in this pleading are true and accurate to the best of my knowledge, information, and belief.'
    );
    this.drawSignatureBlock(nameUpper, 'Petitioner Pro Se', fieldPrefix);
  }
}


// ─── FORM 00: FILING INSTRUCTIONS & STATUTORY CHECKLIST ───────────────
function buildForm00(ctx, payload) {
  ctx.addPage();
  ctx.drawTitleBlock(
    'INDIANA EXPUNGEMENT PETITION PACKET · FILING INSTRUCTIONS',
    'Self-Help Reference Guide for Self-Represented (Pro Se) Petitioners · Indiana Code § 35-38-9'
  );

  ctx.drawHeading('CRITICAL ONE-SHOT EXPUNGEMENT RULE WARNING (IC § 35-38-9-9(i))');
  ctx.drawDoubleSpacedParagraph(
    'Under Indiana Code § 35-38-9-9(i), an individual may file a petition for conviction expungement ' +
    'ONLY ONE (1) TIME IN THEIR ENTIRE LIFE. If you omit any conviction in this county or any other county, ' +
    'you will NEVER be permitted to expunge it. Under IC § 35-38-9-9(d), all petitions across multiple counties ' +
    'must be filed within 365 days of each other.'
  );

  ctx.drawHeading('STEP-BY-STEP ODYSSEY E-FILING GUIDE (CASE TYPE: XP)');
  ctx.drawSingleSpacedParagraph(
    '1. EFSP Providers: You must use a state-approved Electronic Filing Service Provider (EFSP) like Odyssey eFileIN or InfoTrack to file. You cannot upload these directly to MyCase.'
  );
  ctx.drawSingleSpacedParagraph(
    '2. Case Type: Select "XP - Expungement Petition" when initiating your new civil case in the Odyssey E-Filing System (IEFS).'
  );
  ctx.drawSingleSpacedParagraph(
    '3. Lead Document: Upload Form 04 (Verified Petition) as your Lead Document, and attach Form 01 (Appearance) as a secondary filing.'
  );
  ctx.drawSingleSpacedParagraph(
    '4. Confidential Documents: Form 02 (Form ACR) and Form 03 (Confidential Information Sheet) MUST be marked as "Confidential" in the e-filing system.'
  );
  ctx.drawSingleSpacedParagraph(
    '5. Service Requirements (IC § 35-38-9-8(e)): Serve copies on the County Prosecutor, Indiana State Police, BMV, and arresting agencies.'
  );
  ctx.drawSingleSpacedParagraph(
    '6. Fillable Fields & Signatures: Any field left blank can be filled directly in this PDF before filing or printed and signed. If you selected the e-sign option, your "/s/" signature is already affixed and the documents are ready for upload.'
  );
  ctx.drawHeading('CRITICAL PRE-FILING SIGNATURE & INK CHECKLIST:');
  ctx.drawSingleSpacedParagraph('  [ ] Print the complete packet single-sided on standard 8.5 x 11 inch white paper.');
  ctx.drawSingleSpacedParagraph('  [ ] If not electronically signed ("/s/"), sign ALL signature lines in permanent BLACK or BLUE INK.');
  ctx.drawSingleSpacedParagraph('  [ ] Verify Form 04 (Verified Petition) is signed under the Penalties of Perjury (Trial Rule 11).');
  ctx.drawSingleSpacedParagraph('  [ ] Retain at least one full signed copy for your personal records before filing.');
  ctx.drawSingleSpacedParagraph('  [ ] Present original signed pleadings to the Court Clerk (or upload certified signed scans if e-filing).');

  ctx.drawHeading('AFTER THE JUDGE SIGNS: POST-ORDER DISTRIBUTION REQUIREMENTS');
  ctx.drawDoubleSpacedParagraph(
    'Obtaining the signed order is only the beginning. Under Indiana Code § 35-38-9-6 and § 35-38-9-7, ' +
    'the Indiana State Police (ISP) Criminal History Repository, the Bureau of Motor Vehicles (BMV), and ' +
    'all arresting agencies must receive certified copies of the signed order before they are legally ' +
    'obligated to restrict, redact, or seal their records. County clerk practice varies significantly:'
  );
  ctx.drawSingleSpacedParagraph(
    '• AUTOMATIC TRANSMISSION (most IEFS-integrated counties): The Clerk of Courts transmits certified ' +
    'copies electronically to ISP and BMV upon entry of the order. Monitor your MyCase docket at ' +
    'public.courts.in.gov/mycase for the file-stamped order. No additional mailing required.'
  );
  ctx.drawSingleSpacedParagraph(
    '• MANUAL CERTIFIED MAILING (many rural and smaller counties): The Clerk places the burden on you ' +
    'to obtain physical certified copies from the clerk\'s counter (typically $1–$5 per page) and mail them to:'
  );
  ctx.drawSingleSpacedParagraph('  · Indiana State Police Criminal History Repository, 100 N. Senate Ave., Indianapolis, IN 46204');
  ctx.drawSingleSpacedParagraph('  · Indiana Bureau of Motor Vehicles, PO Box 6008, Indianapolis, IN 46206');
  ctx.drawSingleSpacedParagraph('  · All arresting agencies listed in your DOC 10 (County Service Directory enclosed in this packet)');
  ctx.drawDoubleSpacedParagraph(
    'CRITICAL: Your public records will NOT automatically vanish the moment the judge signs the order. ' +
    'Contact the clerk\'s office to verify whether they transmit to ISP and BMV automatically or whether ' +
    'you must obtain and mail certified copies yourself. Failure to transmit means expunged records will ' +
    'continue to appear in employer and agency background checks.'
  );

  ctx.drawHeading('MONITORING THE 30-DAY PROSECUTOR RESPONSE WINDOW (IC § 35-38-9-9)');
  ctx.drawDoubleSpacedParagraph(
    'Under Indiana Code § 35-38-9-9, the prosecuting attorney has 30 days from the date of service ' +
    'of your petition to file a written objection. The following rules apply based on your case type:'
  );
  ctx.drawSingleSpacedParagraph(
    '• Non-convictions (IC § 35-38-9-1) and Class D/Level 6 and lower misdemeanors (IC §§ 35-38-9-2 ' +
    'through 35-38-9-3): If the prosecutor consents or files no objection by day 30, the court is ' +
    'authorized under IC § 35-38-9-9 to grant or deny the petition on the pleadings alone—NO hearing required.'
  );
  ctx.drawSingleSpacedParagraph(
    '• Higher Felony Tiers (IC §§ 35-38-9-4 through 35-38-9-5): The court MUST hold a hearing regardless ' +
    'of whether the prosecutor objects or consents.'
  );
  ctx.drawSingleSpacedParagraph('WHAT TO DO AFTER FILING:');
  ctx.drawSingleSpacedParagraph(
    '1. Days 1–30: Monitor your MyCase docket for a "Prosecutor Response," "Prosecutor Consent," or ' +
    '"Objection to Expungement Petition" entry at public.courts.in.gov/mycase.'
  );
  ctx.drawSingleSpacedParagraph(
    '2. Day 31 with no response: Contact the court coordinator or bailiff to ask whether the judge intends ' +
    'to rule on the pleadings or set a hearing date. Do not assume the matter is resolved.'
  );
  ctx.drawSingleSpacedParagraph(
    '3. If the prosecutor objects: You will receive service through IEFS or by mail. You have the right to ' +
    'file a Reply. Consider contacting Indiana Legal Services (indianalegalservices.org) or a licensed ' +
    'Indiana attorney for guidance before any hearing.'
  );
  ctx.drawSingleSpacedParagraph(
    '4. At any scheduled hearing: Bring all original documentation including your MyCase case summary ' +
    'printout, this full petition packet, and any supporting financial records (proof of fee payment, ' +
    'restitution, fines cleared).'
  );

  const pet = payload.petitioner || {};
  const missingFields = [];

  if (!pet.dob) missingFields.push('Date of Birth');
  if (!pet.ssn) missingFields.push('Social Security Number');
  if (!pet.driverLicense) missingFields.push('Driver\'s License Number');
  if (!pet.streetAddress || !pet.city || !pet.zipCode) missingFields.push('Complete Current Address');
  if (!pet.phone) missingFields.push('Telephone Number');
  
  if (missingFields.length > 0) {
    ctx.drawHeading('MISSING INFORMATION WARNING');
    ctx.drawSingleSpacedParagraph(
      'You generated this packet without providing the following information. You MUST fill these fields in by hand or by typing them into the fillable PDF before filing, or your petition may be rejected by the court:'
    );
    missingFields.forEach(f => {
      ctx.drawSingleSpacedParagraph(`• ${f}`);
    });
  }
}


// ─── FORM 01: APPEARANCE (TRIAL RULE 3.1) ─────────────────────────────
function buildForm01(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'APPEARANCE BY SELF-REPRESENTED PERSON');
  ctx.drawTitleBlock('APPEARANCE BY SELF-REPRESENTED PERSON IN CIVIL CASE');

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();

  ctx.drawSingleSpacedParagraph(
    `1. Party Information: The Petitioner, ${name}, hereby enters an appearance pro se (self-represented) ` +
    `in the above-captioned expungement proceeding pursuant to Indiana Trial Rule 3.1.`,
    { size: 11, extraSpacing: 6 }
  );

  ctx.drawInteractiveKeyValueTable([
    ['Petitioner Legal Name:', name, 'f1_name'],
    ['Current Physical Address:', pet.currentAddress || '', 'f1_address'],
    ['Telephone Number:', pet.phone || '', 'f1_phone'],
    ['Email Address:', pet.email || '', 'f1_email'],
  ], 160);

  ctx.drawSingleSpacedParagraph(
    '2. Case Type & Nature of Proceeding: This is a civil Miscellaneous proceeding for the Expungement of ' +
    'Conviction and Arrest Records (Case Type: XP) pursuant to Indiana Code § 35-38-9.',
    { size: 11, extraSpacing: 6 }
  );

  ctx.drawSingleSpacedParagraph(
    '3. Service Information: Petitioner accepts service of all court documents, notices, and orders at the postal ' +
    'address and/or email address provided above, or via the Indiana Odyssey E-Filing System (IEFS).',
    { size: 11, extraSpacing: 6 }
  );

  ctx.drawSingleSpacedParagraph(
    '4. Representation Status: Petitioner represents himself/herself in this matter and is not represented by legal counsel.',
    { size: 11, extraSpacing: 10 }
  );

  ctx.drawSignatureBlock(nameUpper, 'Petitioner Pro Se', 'f1');
}


// ─── FORM 02: FORM ACR (RULE 5) ───────────────────────────────────────
function buildForm02(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'FORM ACR - EXCLUSION OF CONFIDENTIAL INFO');
  ctx.drawTitleBlock(
    'FORM ACR · NOTICE OF EXCLUSION OF CONFIDENTIAL INFORMATION FROM PUBLIC ACCESS',
    '(Pursuant to Indiana Rules on Access to Court Records, Rule 5)'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();

  ctx.drawSingleSpacedParagraph(
    `Pursuant to the Indiana Rules on Access to Court Records (Rule 5), Petitioner, ${name}, ` +
    `gives notice that the accompanying Confidential Information Supplement (Form 03) contains confidential ` +
    `identifying information that is excluded from public access under Indiana law, and states:`,
    { size: 11, extraSpacing: 8 }
  );

  ctx.drawHeading('1. Confidential Personal Identifiers:');
  ctx.drawSingleSpacedParagraph(
    "The Petitioner's complete Social Security Number, Date of Birth, and Driver's License Number are excluded " +
    "from public access pursuant to Access to Court Records Rule 5(C)(1). These identifiers are supplied under separate " +
    "confidential cover because Indiana Code § 35-38-9-8(b)(8) explicitly mandates them for court review.",
    { size: 11, extraSpacing: 8 }
  );

  ctx.drawHeading('2. Complete Residential History:');
  ctx.drawSingleSpacedParagraph(
    "Petitioner's residential history from the date of the earliest offense to present is excluded from public access " +
    "pursuant to Access to Court Records Rule 5 to protect Petitioner's personal privacy and residential security.",
    { size: 11, extraSpacing: 8 }
  );

  ctx.drawHeading('3. Separate Filing:');
  ctx.drawSingleSpacedParagraph(
    'The excluded information is filed contemporaneously on Form 03 (Confidential Information Supplement) ' +
    'and designated as confidential pursuant to Access to Court Records Rule 5.',
    { size: 11, extraSpacing: 10 }
  );

  ctx.drawSignatureBlock(nameUpper, 'Petitioner Pro Se', 'f2');
}


// ─── FORM 03: CONFIDENTIAL INFORMATION SUPPLEMENT (FORM 03A) ──────────
function buildForm03(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'FORM 03 - CONFIDENTIAL SUPPLEMENT');
  ctx.drawTitleBlock(
    'CONFIDENTIAL INFORMATION SUPPLEMENT & RESIDENTIAL HISTORY',
    'CONFIDENTIAL PER ACCESS TO COURT RECORDS RULE 5 · NOT FOR PUBLIC ACCESS'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();

  ctx.drawHeading('I. PETITIONER PERSONAL IDENTIFIERS:');
  ctx.drawInteractiveKeyValueTable([
    ['Full Legal Name:', name, 'f3_name'],
    ['Other Names / Aliases:', pet.aliases || '', 'f3_aliases'],
    ['Date of Birth:', pet.dob || '', 'f3_dob'],
    ['Social Security Number:', pet.ssn || '', 'f3_ssn'],
    ["Driver's License / ID Number:", `${pet.driverLicense || ''}`, 'f3_dl'],
    ['Current Physical Address:', pet.currentAddress || '', 'f3_currAddr'],
    ['Telephone & Email:', `Phone: ${pet.phone || ''} | Email: ${pet.email || ''}`, 'f3_contact'],
  ], 160);

  ctx.drawHeading('II. RESIDENTIAL ADDRESS HISTORY (10+ YEARS):');
  ctx.drawSingleSpacedParagraph(
    'Required by Indiana Code § 35-38-9-8(b)(3) from date of earliest offense to present (fillable):'
  );

  const addresses = (pet.addresses && pet.addresses.length > 0) ? pet.addresses : [];
  const tableRows = [];
  const count = Math.max(addresses.length, 4);

  for (let i = 0; i < count; i++) {
    const a = addresses[i] || {};
    const street = a.street || a.line || '';
    const city = a.city || '';
    const st = a.state || (street ? 'IN' : '');
    const zip = a.zipCode || '';
    const dates = (a.fromDate || a.toDate) ? `${a.fromDate || '?'} – ${a.toDate || 'Present'}` : '';

    tableRows.push([
      String(i + 1),
      street,
      city,
      st,
      zip,
      dates
    ]);
  }

  ctx.drawInteractiveGridTable(
    ['#', 'Street Address', 'City', 'State', 'ZIP', 'Approx. Residence Dates'],
    tableRows,
    [24, 170, 85, 38, 51, 100],
    'f3_addr'
  );

  ctx.drawPerjuryAffirmation(nameUpper, 'f3');
}


// ─── FORM 04: VERIFIED PETITION FOR EXPUNGEMENT ────────────────────────
function buildForm04(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'VERIFIED PETITION FOR EXPUNGEMENT');
  ctx.drawTitleBlock(
    'VERIFIED PETITION FOR EXPUNGEMENT OF ARREST AND CONVICTION RECORDS',
    '(Pursuant to Indiana Code §§ 35-38-9-1, 35-38-9-2, 35-38-9-3, 35-38-9-4, and 35-38-9-8)'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();
  const cases = payload.cases || [];

  ctx.drawDoubleSpacedParagraph(
    `The Petitioner, ${name}, pro se, respectfully petitions this Court to expunge and seal ` +
    `all records of arrest, charge, and conviction pursuant to Indiana Code § 35-38-9, and in support shows:`
  );

  ctx.drawHeading('1. Petitioner Identification & Indiana Jurisdiction:');
  ctx.drawDoubleSpacedParagraph(
    `Petitioner is a resident of the State of Indiana, born on ${pet.dob || '[Date of Birth]'}, ` +
    `residing at ${pet.currentAddress || '[Current Address]'}. Petitioner's confidential identifiers ` +
    `and 10+ year residential history are filed contemporaneously on Form 03 pursuant to IC § 35-38-9-8(b).`
  );

  ctx.drawHeading('2. Enumeration of Records Seeking Expungement:');
  ctx.drawSingleSpacedParagraph(
    'Petitioner petitions for expungement of the following criminal cases and arrest records in this jurisdiction:'
  );

  const caseRows = [];
  cases.forEach((c, idx) => {
    const disp = c.dispositionDate || c.filed || 'N/A';
    caseRows.push([
      String(idx + 1),
      c.caseNumber || 'Unknown',
      c.type || 'XP',
      c.charges || 'Criminal Proceeding',
      c.statute || 'IC § 35-38-9',
      disp
    ]);
  });

  if (caseRows.length === 0) {
    caseRows.push(['1', 'XXXXX-XXXX-XP-XXXXXX', 'XP', 'Eligible Criminal Records', 'IC § 35-38-9', 'See MyCase']);
  }

  ctx.drawInteractiveGridTable(
    ['#', 'Cause / Case Number', 'Type', 'Charges / Offenses', 'Statutory Basis', 'Disp. Date'],
    caseRows,
    [24, 120, 36, 155, 75, 58],
    'f4_cases'
  );

  ctx.drawHeading('3. Statutory Grounds for Expungement:');
  ctx.drawDoubleSpacedParagraph(
    'A. Section 1 (Arrests, Non-Convictions & Dismissals — IC § 35-38-9-1): ' +
    'At least one (1) year has elapsed since the date of arrest; no charges are pending; Petitioner was not convicted; ' +
    'and Petitioner did not participate in a pretrial diversion program unless successfully completed.'
  );
  ctx.drawDoubleSpacedParagraph(
    'B. Section 2 (Misdemeanors & Minor Offenses — IC § 35-38-9-2): ' +
    'At least five (5) years have passed since date of conviction; Petitioner has not been convicted of any crime within ' +
    'the preceding five (5) years; no criminal charges are pending; and all fines, fees, court costs, and restitution are satisfied.'
  );
  ctx.drawDoubleSpacedParagraph(
    'C. Section 3 (Class D & Level 6 Felonies — IC § 35-38-9-3): ' +
    'At least eight (8) years have passed since date of conviction; Petitioner has not been convicted of a felony within ' +
    'the preceding eight (8) years; no criminal charges are pending; and all financial obligations have been satisfied.'
  );
  ctx.drawDoubleSpacedParagraph(
    'D. Section 4 & 5 (Major Felonies — IC §§ 35-38-9-4 & 35-38-9-5): ' +
    'Petitioner satisfies all applicable statutory waiting periods, sentencing terms, and has obtained prosecutor consent if required by law.'
  );

  ctx.drawHeading('4. Mandatory Statutory Allegations:');
  ctx.drawBullet('No criminal charges are currently pending against Petitioner in any state or federal court.');
  ctx.drawBullet('Petitioner has paid all court costs, fines, administrative fees, probation fees, and restitution ordered by the Court.');
  ctx.drawBullet('Petitioner has successfully completed all terms of probation, incarceration, and community supervision.');
  if (payload.priorFiling && payload.priorFiling.hasPrior && payload.priorFiling.county && payload.priorFiling.date) {
    const priorDateObj = new Date(payload.priorFiling.date + 'T00:00:00');
    const priorDateStr = !isNaN(priorDateObj.getTime())
      ? priorDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : payload.priorFiling.date;
    const causeClause = payload.priorFiling.causeNumber ? ` under Cause No. ${payload.priorFiling.causeNumber}` : '';
    ctx.drawBullet(
      `Petitioner previously filed a petition for expungement in ${payload.priorFiling.county} County${causeClause} on ` +
      `${priorDateStr}, and this petition is timely submitted within the 365-day consolidation period prescribed by IC § 35-38-9-9(d).`
    );
    ctx.drawBullet(
      'Petitioner has never previously filed a petition for conviction expungement in Indiana other than the timely consolidated filing disclosed herein (IC § 35-38-9-9(d) & (i)).'
    );
  } else {
    ctx.drawBullet('Petitioner has never previously filed a petition for conviction expungement in Indiana (One-Shot Rule compliance).');
    ctx.drawBullet('All other petitions in other Indiana counties (if any) have been or will be filed within 365 days (IC § 35-38-9-9(d)).');
  }

  ctx.drawHeading('5. Prayer for Relief:');
  ctx.drawDoubleSpacedParagraph(
    'WHEREFORE, Petitioner respectfully prays that this Court enter an Order Granting Expungement of all enumerated records, ' +
    'directing the Clerk of Court, Indiana State Police Criminal History Repository, Indiana Bureau of Motor Vehicles, and each ' +
    'arresting law enforcement agency to seal, redact, and prohibit disclosure of said records to the full extent of the law, ' +
    'and restoring all of Petitioner’s civil rights, and for all other just and proper relief.'
  );

  ctx.drawPerjuryAffirmation(nameUpper, 'f4');
}


// ─── FORM 05: NOTICE OF FILING TO PROSECUTOR ───────────────────────────
function buildForm05(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'NOTICE OF FILING TO PROSECUTOR');
  ctx.drawTitleBlock(
    'NOTICE OF FILING OF EXPUNGEMENT PETITION TO PROSECUTING ATTORNEY',
    '(Pursuant to Indiana Code § 35-38-9-8(e))'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();
  const county = payload.county || 'County';

  ctx.drawHeading(`TO: OFFICE OF THE PROSECUTING ATTORNEY OF ${county.toUpperCase()} COUNTY, INDIANA`);
  ctx.drawDoubleSpacedParagraph(
    `PLEASE TAKE NOTICE that on this date, Petitioner, ${name}, filed a Verified Petition for ` +
    `Expungement of Arrest and Conviction Records pursuant to Indiana Code § 35-38-9 in the above-captioned Court.`
  );
  if (payload.priorFiling && payload.priorFiling.hasPrior && payload.priorFiling.county && payload.priorFiling.date) {
    const priorDateObj = new Date(payload.priorFiling.date + 'T00:00:00');
    const priorDateStr = !isNaN(priorDateObj.getTime())
      ? priorDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : payload.priorFiling.date;
    const causeClause = payload.priorFiling.causeNumber ? ` under Cause No. ${payload.priorFiling.causeNumber}` : '';
    ctx.drawDoubleSpacedParagraph(
      `STATUTORY CROSS-COUNTY DISCLOSURE (IC § 35-38-9-9(d)): Petitioner hereby affirmatively discloses ` +
      `that a related petition for expungement was previously filed in ${payload.priorFiling.county} County${causeClause} on ` +
      `${priorDateStr}. The within petition is timely filed within the 365-day statutory consolidation period.`
    );
  }
  ctx.drawDoubleSpacedParagraph(
    'Pursuant to Indiana Code § 35-38-9-8(e), the Prosecuting Attorney has thirty (30) days from service ' +
    'of this Notice to file an Answer, Response, or Objection to the Petition for Expungement.'
  );
  ctx.drawDoubleSpacedParagraph(
    'If the Prosecuting Attorney does not file an objection within thirty (30) days, the Court may grant the ' +
    'petition without setting a hearing, provided the statutory conditions of Indiana Code § 35-38-9 are met.'
  );

  ctx.drawSignatureBlock(nameUpper, 'Petitioner Pro Se', 'f5');
}


// ─── FORM 06: CERTIFICATE OF SERVICE ──────────────────────────────────
function buildForm06(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'CERTIFICATE OF SERVICE');
  ctx.drawTitleBlock('CERTIFICATE OF SERVICE', '(Pursuant to Indiana Trial Rule 5 & IC § 35-38-9-8(e))');

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();
  const county = payload.county || 'Marion';
  const countyInfo = getCountyInfo(county);
  const method = payload.serviceMethod || (payload.eSignDocuments ? 'iefs' : 'certified_mail');

  ctx.drawSingleSpacedParagraph(
    `I hereby certify that on the date set forth below, a true and correct copy of the foregoing ` +
    `Verified Petition for Expungement of Arrest and Conviction Records, Appearance, Notice of Exclusion ` +
    `of Confidential Information, and Proposed Order was served upon the following parties pursuant to Indiana Trial Rule 5 ` +
    `and Indiana Code § 35-38-9-8(e):`,
    { size: 11, extraSpacing: 8 }
  );

  const recipients = [
    {
      num: '1.',
      title: countyInfo.prosecutor.title,
      line: `${countyInfo.prosecutor.division}, ${countyInfo.prosecutor.address}, ${countyInfo.prosecutor.city}, IN ${countyInfo.prosecutor.zip} (${countyInfo.prosecutor.serviceNotes})`
    },
    {
      num: '2.',
      title: STATEWIDE_AGENCIES.isp.name,
      line: `${STATEWIDE_AGENCIES.isp.division}, ${STATEWIDE_AGENCIES.isp.address}, ${STATEWIDE_AGENCIES.isp.city}, IN ${STATEWIDE_AGENCIES.isp.zip} (via Certified Mail)`
    },
    {
      num: '3.',
      title: STATEWIDE_AGENCIES.bmv.name,
      line: `${STATEWIDE_AGENCIES.bmv.division}, ${STATEWIDE_AGENCIES.bmv.address}, ${STATEWIDE_AGENCIES.bmv.city}, IN ${STATEWIDE_AGENCIES.bmv.zip} (via Certified Mail)`
    },
    {
      num: '4.',
      title: countyInfo.sheriff.title,
      line: `${countyInfo.sheriff.address}, ${countyInfo.sheriff.city}, IN ${countyInfo.sheriff.zip} and Local Arresting Police Departments (via First Class / Certified Mail)`
    }
  ];

  for (const r of recipients) {
    ctx.drawText(r.num, 72, ctx.cursorY, 10.5, 'bold');
    ctx.drawText(r.title, 90, ctx.cursorY, 10.5, 'bold');
    ctx.cursorY -= 14;
    const wrapped = ctx.wrapText(r.line, ctx.fonts.regular, 10, ctx.contentWidth - 22);
    for (const wl of wrapped) {
      ctx.drawText(wl, 90, ctx.cursorY, 10, 'regular');
      ctx.cursorY -= 13;
    }
    ctx.cursorY -= 4;
  }

  const iefsBox = method === 'iefs' ? '[X]' : '[  ]';
  const certBox = method === 'certified_mail' ? '[X]' : '[  ]';
  const mailBox = method === 'first_class' ? '[X]' : '[  ]';

  ctx.drawHeading('Method of Service:');
  ctx.drawText(`${iefsBox} Indiana Odyssey E-Filing System (IEFS)      ${certBox} Certified Mail      ${mailBox} First Class Mail`, 72, ctx.cursorY, 10.5, 'regular');
  ctx.cursorY -= 16;

  ctx.drawSignatureBlock(nameUpper, 'Petitioner Pro Se', 'f6');
}


// ─── FORM 07: PROPOSED ORDER GRANTING EXPUNGEMENT ──────────────────────
function buildForm07(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'ORDER GRANTING EXPUNGEMENT');
  ctx.drawTitleBlock(
    'ORDER GRANTING EXPUNGEMENT OF ARREST AND CONVICTION RECORDS',
    '(Pursuant to Indiana Code § 35-38-9)'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const cases = payload.cases || [];

  const section1Cases = cases.filter(c => c.statute === 'IC § 35-38-9-1');
  const convictionCases = cases.filter(c => c.statute !== 'IC § 35-38-9-1');

  ctx.drawDoubleSpacedParagraph(
    `Come now the Court, having reviewed the Verified Petition for Expungement filed by Petitioner, ${name}, ` +
    `the response of the Prosecuting Attorney (or having noted that no timely objection was filed), ` +
    `and having reviewed the official record, now finds and orders:`
  );

  ctx.drawHeading('FINDINGS OF FACT & CONCLUSIONS OF LAW:');
  ctx.drawBullet('1. The Court has personal jurisdiction over Petitioner and subject-matter jurisdiction under IC § 35-38-9.');
  ctx.drawBullet('2. The Prosecuting Attorney was served with statutory notice pursuant to IC § 35-38-9-8(e).');
  ctx.drawBullet('3. Petitioner satisfies all applicable waiting periods and conditions set forth in IC § 35-38-9.');
  ctx.drawBullet('4. No criminal proceedings are pending against Petitioner in any jurisdiction.');
  ctx.drawBullet('5. Petitioner has satisfied all court costs, fines, user fees, and restitution obligations.');
  if (convictionCases.length > 0) {
    ctx.drawBullet('6. Petitioner has not previously received an expungement of a conviction record in any Indiana court (IC § 35-38-9-9(i)).');
  }

  ctx.drawHeading('IT IS THEREFORE ORDERED, ADJUDGED, AND DECREED:');

  // Bifurcated Relief: Non-Convictions vs. Convictions
  if (section1Cases.length > 0) {
    ctx.drawDoubleSpacedParagraph(
      '1. ARREST AND NON-CONVICTION RECORDS (IC § 35-38-9-1): The Petition is GRANTED as to all records, ' +
      'arrests, charges, and proceedings resulting in dismissal, acquittal, or no charges filed as itemized below. ' +
      'The Clerk of Court, Indiana State Police, Bureau of Motor Vehicles, and all law enforcement agencies ' +
      'holding records pertaining to said cases shall permanently redact and seal all public records relating to these proceedings ' +
      'and shall not disclose them to any person except as authorized under Indiana Code § 35-38-9-1:'
    );
    section1Cases.forEach(c => {
      ctx.drawBullet(`Cause No. ${c.caseNumber || 'Unknown'} — ${c.charges || 'Non-Conviction / Dismissal'} (${c.type || 'XP'}) [IC § 35-38-9-1]`, 14);
    });
  }

  if (convictionCases.length > 0) {
    const sectionNum = section1Cases.length > 0 ? '2' : '1';
    ctx.drawDoubleSpacedParagraph(
      `${sectionNum}. CONVICTION RECORDS (IC §§ 35-38-9-2 THROUGH 35-38-9-5): The Petition is GRANTED as to the ` +
      'conviction records enumerated below. Pursuant to Indiana Code § 35-38-9-6 and § 35-38-9-7, the Clerk of Court, ' +
      'Indiana State Police, and arresting agencies shall prohibit disclosure of these records or mark them as expunged ' +
      'in accordance with statutory access restrictions:'
    );
    convictionCases.forEach(c => {
      ctx.drawBullet(`Cause No. ${c.caseNumber || 'Unknown'} — ${c.charges || 'Offenses'} (${c.type || 'XP'}) [${c.statute || 'IC § 35-38-9'}]`, 14);
    });

    const restoreNum = section1Cases.length > 0 ? '3' : '2';
    ctx.drawDoubleSpacedParagraph(
      `${restoreNum}. Petitioner’s full civil rights (including rights to vote, hold public office, and serve on a jury) are fully RESTORED pursuant to IC § 35-38-9-10.`
    );
  } else if (section1Cases.length > 0) {
    ctx.drawDoubleSpacedParagraph(
      '2. Pursuant to IC § 35-38-9-10, Petitioner shall be treated as not having been arrested or charged with respect to all sealed records.'
    );
  }

  ctx.ensureSpace(95);
  ctx.drawText('SO ORDERED this ________ day of ____________________, 20____.', 72, ctx.cursorY, 12, 'bold');
  ctx.cursorY -= 40; // Blank space for Judge's physical signature
  ctx.drawLine(72, ctx.cursorY, 320, ctx.cursorY, 1, ctx.colors.black);
  ctx.drawText('Judge, Circuit / Superior Court', 72, ctx.cursorY - 16, 12, 'bold');
  ctx.cursorY -= 32;

  ctx.drawHeading('DISTRIBUTION LIST FOR CLERK OF COURT:');
  ctx.drawSingleSpacedParagraph(
    'The Clerk shall transmit certified copies of this Order to: (1) Petitioner, (2) Prosecuting Attorney, ' +
    '(3) Indiana State Police Records Division, (4) Indiana Bureau of Motor Vehicles, and (5) Arresting Agencies.'
  );
}


// ─── FORM 08: FEE WAIVER (IN FORMA PAUPERIS) ──────────────────────────
function buildForm08(ctx, payload) {
  ctx.addPage();
  ctx.drawCaption(payload, 'PETITION FOR FEE WAIVER & ORDER');
  ctx.drawTitleBlock(
    'VERIFIED PETITION FOR WAIVER OF COURT COSTS AND FILING FEES',
    '(In Forma Pauperis · Indiana Code § 33-37-3-2)'
  );

  const pet = payload.petitioner || {};
  const name = pet.fullName || 'Petitioner';
  const nameUpper = name.toUpperCase();

  ctx.drawDoubleSpacedParagraph(
    `Petitioner, ${name}, pro se, respectfully requests this Court waive all civil court costs, ` +
    `filing fees, and administrative charges in this action pursuant to Indiana Code § 33-37-3-2, and states:`
  );

  ctx.drawHeading('1. Financial Inability Statement:');
  ctx.drawDoubleSpacedParagraph(
    'Petitioner is indigent and without sufficient income, assets, or resources to pay the filing fees ' +
    'and court costs associated with initiating this expungement proceeding without causing substantial hardship to Petitioner and dependents.'
  );

  ctx.drawHeading('2. Affidavit of Income & Financial Resources:');
  ctx.drawInteractiveKeyValueTable([
    ['Petitioner Legal Name:', name, 'f8_name'],
    ['Current Monthly Gross Income:', '', 'f8_income'],
    ['Public Assistance Received:', '', 'f8_assistance'],
    ['Number of Minor Dependents:', '', 'f8_dependents'],
    ['Monthly Housing & Living Expenses:', '', 'f8_expenses'],
  ], 175);

  ctx.drawPerjuryAffirmation(nameUpper, 'f8');

  ctx.ensureSpace(120);
  ctx.drawLine(72, ctx.cursorY, 540, ctx.cursorY, 1, ctx.colors.black);
  ctx.cursorY -= 16;
  ctx.drawTitleBlock('ORDER ON FEE WAIVER REQUEST');
  ctx.drawDoubleSpacedParagraph(
    'The Court, having considered Petitioner’s Verified Petition for Fee Waiver, now finds that Petitioner ' +
    'is indigent and unable to pay court costs. IT IS THEREFORE ORDERED that the filing fees and court costs in this action ' +
    'are hereby [   ] WAIVED in full; [   ] DENIED.'
  );
  ctx.cursorY -= 36; // Blank space for Judge's physical signature
  ctx.drawLine(72, ctx.cursorY, 320, ctx.cursorY, 1, ctx.colors.black);
  ctx.drawText('Judge, Circuit / Superior Court', 72, ctx.cursorY - 16, 12, 'bold');
  ctx.cursorY -= 28;
}


// ─── MASTER PACKET GENERATOR ──────────────────────────────────────────
export async function generateCompletePacket(payload, onProgress = null) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  // Official Permitted Indiana Court Font: Times New Roman (12pt+)
  const regularFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  // Strictly Black text per Document Formatting Guide
  const colors = {
    black: rgb(0, 0, 0),
    darkText: rgb(0, 0, 0),
    tableHeaderBg: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0, 0, 0),
    fieldBorder: rgb(0.65, 0.65, 0.70),
    fieldBg: rgb(0.97, 0.98, 1.0)
  };

  const ctx = new PdfContext(pdfDoc, { regular: regularFont, bold: boldFont, italic: italicFont }, colors);
  ctx.isEsign = payload.eSignDocuments || false;

  const target = payload.targetForm || 'all';
  const shouldBuild = (formKey) => target === 'all' || target === formKey;

  const formsToBuild = [
    { key: 'form00', docId: 'Form 00', name: 'Instructions & Warnings Cover Sheet', build: () => buildForm00(ctx, payload), condition: shouldBuild('form00') },
    { key: 'form01', docId: 'Form 01', name: 'Appearance Form (Trial Rule 3.1)', build: () => buildForm01(ctx, payload), condition: shouldBuild('form01') },
    { key: 'form02', docId: 'Form 02', name: 'Form ACR (Notice of Exclusion of Confidential Information)', build: () => buildForm02(ctx, payload), condition: shouldBuild('form02') },
    { key: 'form03', docId: 'Form 03', name: 'Confidential Information & 10-Year Address History', build: () => buildForm03(ctx, payload), condition: shouldBuild('form03') && payload.includeAddressSupplement !== false },
    { key: 'form04', docId: 'Form 04', name: 'Verified Petition for Expungement', build: () => buildForm04(ctx, payload), condition: shouldBuild('form04') },
    { key: 'form05', docId: 'Form 05', name: 'Notice of Filing to Prosecuting Attorney', build: () => buildForm05(ctx, payload), condition: shouldBuild('form05') },
    { key: 'form06', docId: 'Form 06', name: 'Certificate of Service', build: () => buildForm06(ctx, payload), condition: shouldBuild('form06') },
    { key: 'form07', docId: 'Form 07', name: 'Proposed Order Granting Expungement', build: () => buildForm07(ctx, payload), condition: shouldBuild('form07') },
    { key: 'form08', docId: 'Form 08', name: 'Fee Waiver Request & Order', build: () => buildForm08(ctx, payload), condition: shouldBuild('form08') && payload.includeFeeWaiver }
  ].filter(f => f.condition);

  const totalForms = formsToBuild.length;
  for (let idx = 0; idx < totalForms; idx++) {
    const formDef = formsToBuild[idx];
    if (typeof onProgress === 'function') {
      try {
        onProgress({
          formIndex: idx + 1,
          totalForms,
          formKey: formDef.key,
          formName: formDef.name
        });
      } catch (pErr) {
        console.warn('[PDF Engine] onProgress handler error:', pErr);
      }
    }

    ctx.startDocument(formDef.docId);
    try {
      formDef.build();
    } catch (buildErr) {
      console.error(`[PDF Engine] Error building ${formDef.docId} (${formDef.name}):`, buildErr);
      throw new Error(`Failed generating ${formDef.name}: ${buildErr.message}`);
    }
    ctx.endDocument();
  }

  // Per-Document Pagination (Section 4):
  // Each court pleading/form is independently paginated (e.g. Page 1 of 3, Page 2 of 3)
  for (const doc of ctx.documents) {
    for (let p = 0; p < doc.pageCount; p++) {
      const pageIndex = doc.startIndex + p;
      const page = pdfDoc.getPage(pageIndex);
      const pageNumStr = `Page ${p + 1} of ${doc.pageCount}`;
      const strWidth = regularFont.widthOfTextAtSize(pageNumStr, 10.5);
      page.drawText(pageNumStr, {
        x: (612 - strWidth) / 2,
        y: 36,
        size: 10.5,
        font: regularFont,
        color: colors.black
      });

      // Statutory Version & Audit Stamp (Trial Rule 10 compliant footer)
      const versionStamp = 'IC § 35-38-9 · Engine v1.2.0 · Statute Last Reviewed: Sept 2026 · Pro Se Document Formatter';
      page.drawText(versionStamp, {
        x: 72,
        y: 36,
        size: 7.5,
        font: italicFont,
        color: rgb(0.35, 0.35, 0.35)
      });
    }
  }

  return await pdfDoc.save();
}

// Standalone Appearance generator for backward compatibility
export async function generateAppearanceForm(payload) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;
  const pdfDoc = await PDFDocument.create();

  const regularFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const colors = {
    black: rgb(0, 0, 0),
    darkText: rgb(0, 0, 0),
    tableHeaderBg: rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0, 0, 0),
    fieldBorder: rgb(0.65, 0.65, 0.70),
    fieldBg: rgb(0.97, 0.98, 1.0)
  };

  const ctx = new PdfContext(pdfDoc, { regular: regularFont, bold: boldFont, italic: italicFont }, colors);
  ctx.isEsign = payload.eSignDocuments || false;
  
  ctx.startDocument('Form 01');
  buildForm01(ctx, payload);
  ctx.endDocument();

  for (const doc of ctx.documents) {
    for (let p = 0; p < doc.pageCount; p++) {
      const page = pdfDoc.getPage(doc.startIndex + p);
      const pageNumStr = `Page ${p + 1} of ${doc.pageCount}`;
      const strWidth = regularFont.widthOfTextAtSize(pageNumStr, 10.5);
      page.drawText(pageNumStr, {
        x: (612 - strWidth) / 2,
        y: 36,
        size: 10.5,
        font: regularFont,
        color: colors.black
      });

      const versionStamp = 'IC § 35-38-9 · Engine v1.2.0 · Statute Last Reviewed: Sept 2026 · Pro Se Document Formatter';
      page.drawText(versionStamp, {
        x: 72,
        y: 36,
        size: 7.5,
        font: italicFont,
        color: rgb(0.35, 0.35, 0.35)
      });
    }
  }

  return await pdfDoc.save();
}

if (typeof window !== 'undefined') {
  window.PdfGenerator = {
    generateCompletePacket,
    generateAppearanceForm
  };
}
