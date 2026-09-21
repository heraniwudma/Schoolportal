import { Injectable, Logger } from '@nestjs/common';
import PDFDocument = require('pdfkit');

interface TableColumn {
  header: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

@Injectable()
export class PdfExportService {
  private readonly logger = new Logger(PdfExportService.name);

  private readonly institutionName = 'School Management Portal';
  private readonly primaryColor = '#1e3a8a'; // Deep Navy
  private readonly secondaryColor = '#3b82f6'; // Blue
  private readonly textColor = '#1e293b'; // Slate 800
  private readonly mutedTextColor = '#64748b'; // Slate 500
  private readonly borderColor = '#cbd5e1'; // Slate 300
  private readonly headerBgColor = '#f1f5f9'; // Slate 100
  private readonly zebraBgColor = '#f8fafc'; // Slate 50

  /**
   * Converts a PDFKit document into a completed Buffer.
   */
  private finalizeDocument(doc: PDFKit.PDFDocument, generatedDateStr: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      try {
        // Stamp running footers with "Page X of Y" on all buffered pages
        const range = doc.bufferedPageRange();
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const pageHeight = doc.page.height;
          const pageWidth = doc.page.width;
          const margin = doc.page.margins.left;
          const contentWidth = pageWidth - margin - doc.page.margins.right;
          const footerY = pageHeight - 30;

          // Thin separator line above footer
          doc
            .strokeColor('#e2e8f0')
            .lineWidth(0.5)
            .moveTo(margin, footerY - 6)
            .lineTo(margin + contentWidth, footerY - 6)
            .stroke();

          // Left footer text
          doc
            .font('Helvetica')
            .fontSize(7.5)
            .fillColor(this.mutedTextColor)
            .text(
              `${this.institutionName} • Generated on ${generatedDateStr}`,
              margin,
              footerY,
              { width: contentWidth / 2, align: 'left' },
            );

          // Right footer text: Page X of Y
          doc
            .font('Helvetica-Bold')
            .fontSize(7.5)
            .fillColor(this.mutedTextColor)
            .text(
              `Page ${i + 1} of ${range.count}`,
              margin + contentWidth / 2,
              footerY,
              { width: contentWidth / 2, align: 'right' },
            );
        }

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Formats a standard institutional header banner with metadata fields.
   */
  private drawHeaderBanner(
    doc: PDFKit.PDFDocument,
    title: string,
    metadataRows: Array<Array<{ label: string; value: string }>>,
  ) {
    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin - doc.page.margins.right;

    // Top primary color accent bar
    doc.rect(margin, margin, contentWidth, 4).fill(this.primaryColor);

    let currentY = margin + 12;

    // Institution Name
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(this.primaryColor)
      .text(this.institutionName.toUpperCase(), margin, currentY, {
        width: contentWidth,
        align: 'left',
      });

    currentY += 18;

    // Document Title
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(this.textColor)
      .text(title, margin, currentY, {
        width: contentWidth,
        align: 'left',
      });

    currentY += 16;

    // Metadata card box
    const cardPadding = 8;
    const rowHeight = 14;
    const cardHeight = metadataRows.length * rowHeight + cardPadding * 2;

    doc
      .roundedRect(margin, currentY, contentWidth, cardHeight, 4)
      .fillColor(this.headerBgColor)
      .fill()
      .strokeColor(this.borderColor)
      .lineWidth(0.5)
      .stroke();

    let metaY = currentY + cardPadding;

    for (const row of metadataRows) {
      const colWidth = contentWidth / row.length;
      row.forEach((item, idx) => {
        const itemX = margin + idx * colWidth + 8;
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(this.primaryColor)
          .text(`${item.label}: `, itemX, metaY, { continued: true })
          .font('Helvetica')
          .fillColor(this.textColor)
          .text(item.value || '—');
      });
      metaY += rowHeight;
    }

    doc.y = currentY + cardHeight + 12;
  }

  /**
   * Helper to draw a clean, paginated data table.
   */
  private drawTable(
    doc: PDFKit.PDFDocument,
    columns: TableColumn[],
    rows: string[][],
    options?: {
      headerHeight?: number;
      rowHeight?: number;
      fontSize?: number;
      onNewPage?: () => void;
    },
  ) {
    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - margin - doc.page.margins.right;
    const headerHeight = options?.headerHeight ?? 20;
    const rowHeight = options?.rowHeight ?? 18;
    const fontSize = options?.fontSize ?? 8;
    const bottomMargin = 45;

    const renderHeader = () => {
      let x = margin;
      const y = doc.y;

      // Header background
      doc
        .rect(margin, y, contentWidth, headerHeight)
        .fillColor(this.primaryColor)
        .fill();

      // Header texts
      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#ffffff');

      for (const col of columns) {
        doc.text(col.header, x + 4, y + (headerHeight - fontSize) / 2 - 1, {
          width: col.width - 8,
          align: col.align || 'left',
        });
        x += col.width;
      }

      doc.y = y + headerHeight;
    };

    renderHeader();

    // Render data rows
    rows.forEach((row, rowIndex) => {
      // Check if row exceeds page height
      if (doc.y + rowHeight > pageHeight - bottomMargin) {
        doc.addPage();
        if (options?.onNewPage) {
          options.onNewPage();
        }
        renderHeader();
      }

      const y = doc.y;
      const isZebra = rowIndex % 2 === 1;

      // Background fill
      if (isZebra) {
        doc
          .rect(margin, y, contentWidth, rowHeight)
          .fillColor(this.zebraBgColor)
          .fill();
      }

      // Bottom row separator
      doc
        .strokeColor(this.borderColor)
        .lineWidth(0.5)
        .moveTo(margin, y + rowHeight)
        .lineTo(margin + contentWidth, y + rowHeight)
        .stroke();

      // Render cell contents
      let x = margin;
      row.forEach((cellText, colIndex) => {
        const col = columns[colIndex];
        if (!col) return;

        doc
          .font('Helvetica')
          .fontSize(fontSize)
          .fillColor(this.textColor)
          .text(cellText ?? '—', x + 4, y + (rowHeight - fontSize) / 2 - 1, {
            width: col.width - 8,
            align: col.align || 'left',
          });

        x += col.width;
      });

      doc.y = y + rowHeight;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Admin Section Reports Summary PDF
  // ─────────────────────────────────────────────────────────────────────────────

  async generateSectionsSummaryPdf(
    sections: any[],
    academicYearName: string,
    filters?: { status?: string; search?: string },
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: 'Section Reports Summary',
        Author: this.institutionName,
      },
    });

    const metadataRows = [
      [
        { label: 'Academic Year', value: academicYearName || 'All Years' },
        { label: 'Status Filter', value: filters?.status || 'All' },
        { label: 'Search Query', value: filters?.search ? `"${filters.search}"` : 'None' },
        { label: 'Total Sections', value: String(sections.length) },
      ],
      [
        {
          label: 'Total Enrolled Students',
          value: String(sections.reduce((sum, s) => sum + (s.enrolledCount || 0), 0)),
        },
        {
          label: 'Submitted Sections',
          value: String(sections.filter((s) => s.status === 'Submitted').length),
        },
        {
          label: 'Pending Review',
          value: String(sections.filter((s) => s.status === 'Pending Review').length),
        },
        {
          label: 'Draft Sections',
          value: String(sections.filter((s) => s.status === 'Draft' || !s.status).length),
        },
      ],
    ];

    this.drawHeaderBanner(doc, 'ACADEMIC SECTION REPORTS & SUBMISSION SUMMARY', metadataRows);

    // Columns: Widths must sum up to contentWidth (841.89 - 72 = 769.89)
    const columns: TableColumn[] = [
      { header: 'Section', width: 140, align: 'left' },
      { header: 'Grade Level', width: 90, align: 'left' },
      { header: 'Homeroom Teacher', width: 150, align: 'left' },
      { header: 'Enrolled', width: 70, align: 'center' },
      { header: 'Subject Marks', width: 110, align: 'center' },
      { header: 'Conduct Status', width: 100, align: 'center' },
      { header: 'Status', width: 109, align: 'center' },
    ];

    const rows = sections.map((sec) => [
      sec.displayName || sec.name || '—',
      sec.gradeLevelName || '—',
      sec.homeroomTeacher || 'Unassigned',
      String(sec.enrolledCount ?? 0),
      `${sec.submittedSubjects ?? 0} / ${sec.totalSubjects ?? 0} submitted`,
      sec.conductStatus
        ? sec.conductStatus.charAt(0).toUpperCase() + sec.conductStatus.slice(1)
        : 'None',
      sec.status || 'Draft',
    ]);

    this.drawTable(doc, columns, rows);

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Compiled Student Report Cards Table PDF
  // ─────────────────────────────────────────────────────────────────────────────

  async generateCompiledReportCardsPdf(
    reportCards: any[],
    sectionInfo: {
      displayName?: string;
      name?: string;
      gradeLevel?: string;
      homeroomTeacher?: string;
      academicYear?: string;
    },
    academicYearName: string,
    activeSearch?: string,
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Report Cards - ${sectionInfo.displayName || sectionInfo.name || 'Section'}`,
        Author: this.institutionName,
      },
    });

    const classAvg =
      reportCards.length > 0
        ? (
            reportCards.reduce((sum, r) => sum + (Number(r.overallAverage) || 0), 0) /
            reportCards.length
          ).toFixed(1)
        : '0.0';

    const topStudent = reportCards.find((r) => r.overallRank === 1);

    const metadataRows = [
      [
        {
          label: 'Class Section',
          value: sectionInfo.displayName || sectionInfo.name || '—',
        },
        { label: 'Academic Year', value: academicYearName || sectionInfo.academicYear || '—' },
        { label: 'Homeroom Teacher', value: sectionInfo.homeroomTeacher || 'Unassigned' },
        { label: 'Total Students', value: String(reportCards.length) },
      ],
      [
        { label: 'Class Average', value: `${classAvg}%` },
        {
          label: 'Top Performing Student',
          value: topStudent
            ? `${topStudent.firstName} ${topStudent.lastName} (${topStudent.overallAverage}%)`
            : '—',
        },
        { label: 'Filter / Search', value: activeSearch ? `"${activeSearch}"` : 'All Students' },
        { label: 'Status', value: 'Compiled Official' },
      ],
    ];

    this.drawHeaderBanner(doc, 'STUDENT REPORT CARDS & PERFORMANCE SUMMARY', metadataRows);

    // Columns: Widths must sum up to contentWidth (~770)
    const columns: TableColumn[] = [
      { header: 'Rank', width: 45, align: 'center' },
      { header: 'Admission No', width: 90, align: 'left' },
      { header: 'Student Name', width: 155, align: 'left' },
      { header: 'Gender', width: 55, align: 'center' },
      { header: 'Subjects Overview / Scores', width: 220, align: 'left' },
      { header: 'Total', width: 55, align: 'right' },
      { header: 'Average', width: 60, align: 'right' },
      { header: 'Absences', width: 55, align: 'center' },
      { header: 'Conduct', width: 45, align: 'center' },
    ];

    const rows = reportCards.map((st) => {
      const subjectSummary =
        st.subjectResults && st.subjectResults.length > 0
          ? st.subjectResults
              .slice(0, 4)
              .map(
                (s: any) =>
                  `${s.subjectName || s.subjectCode || 'Sub'}: ${
                    s.yearlyAvg != null
                      ? `${s.yearlyAvg}%`
                      : s.sem1Avg != null
                      ? `${s.sem1Avg}%`
                      : '—'
                  }`,
              )
              .join(' | ') + (st.subjectResults.length > 4 ? ` (+${st.subjectResults.length - 4} more)` : '')
          : 'No scores entered';

      return [
        st.overallRank ? `#${st.overallRank}` : '—',
        st.admissionNo || '—',
        `${st.firstName || ''} ${st.lastName || ''}`.trim() || '—',
        st.gender || st.sex || '—',
        subjectSummary,
        st.overallTotal != null ? String(st.overallTotal) : '—',
        st.overallAverage != null ? `${Number(st.overallAverage).toFixed(1)}%` : '—',
        `${st.absentDays ?? 0} d`,
        st.conduct || 'A',
      ];
    });

    this.drawTable(doc, columns, rows, {
      rowHeight: 22,
      fontSize: 7.5,
    });

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Consolidated Class Roster PDF (7 Academic Periods)
  // ─────────────────────────────────────────────────────────────────────────────

  async generateConsolidatedRosterPdf(
    rosterData: {
      section: { name: string; grade?: string; homeroomTeacher: string | null };
      terms: string[];
      subjects: Array<{ id: string; name: string; code: string }>;
      students: any[];
      statistics?: {
        totalEnrolled: number;
        completeCount: number;
        incompleteCount: number;
        classAverage: number | null;
      };
    },
    academicYearName: string,
    activeSearch?: string,
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 30,
      bufferPages: true,
      info: {
        Title: `Class Roster - ${rosterData.section.name}`,
        Author: this.institutionName,
      },
    });

    const sectionLabel = rosterData.section.grade
      ? /^grade\b/i.test(rosterData.section.grade)
        ? `${rosterData.section.grade} ${rosterData.section.name}`
        : `Grade ${rosterData.section.grade} ${rosterData.section.name}`
      : rosterData.section.name;

    const metadataRows = [
      [
        { label: 'Class Section', value: sectionLabel },
        { label: 'Academic Year', value: academicYearName || '2025/2026' },
        { label: 'Homeroom Teacher', value: rosterData.section.homeroomTeacher || 'Unassigned' },
        { label: 'Enrolled Students', value: String(rosterData.students.length) },
      ],
      [
        {
          label: 'Class Average',
          value:
            rosterData.statistics?.classAverage != null
              ? `${rosterData.statistics.classAverage.toFixed(1)}%`
              : '—',
        },
        {
          label: 'Completion Status',
          value: rosterData.statistics
            ? `${rosterData.statistics.completeCount} Complete / ${rosterData.statistics.incompleteCount} Incomplete`
            : '—',
        },
        { label: 'Search Filter', value: activeSearch ? `"${activeSearch}"` : 'All Students' },
        { label: 'Subjects Count', value: String(rosterData.subjects.length) },
      ],
    ];

    this.drawHeaderBanner(doc, 'CONSOLIDATED ACADEMIC CLASS ROSTER', metadataRows);

    // Available content width: 841.89 - 60 = 781.89
    const totalWidth = 781;
    const fixedWidth = 25 + 65 + 115 + 25 + 25 + 40 + 40 + 40 + 35 + 35 + 35; // = 480
    const remainingWidth = Math.max(totalWidth - fixedWidth, 200);
    const subjectColWidth =
      rosterData.subjects.length > 0
        ? Math.floor(remainingWidth / rosterData.subjects.length)
        : 40;

    const columns: TableColumn[] = [
      { header: '#', width: 25, align: 'center' },
      { header: 'Adm No', width: 65, align: 'left' },
      { header: 'Student Name', width: 115, align: 'left' },
      { header: 'Age', width: 25, align: 'center' },
      { header: 'Sex', width: 25, align: 'center' },
      { header: 'Period', width: 40, align: 'center' },
      ...rosterData.subjects.map((s) => ({
        header: s.code || s.name.substring(0, 4),
        width: subjectColWidth,
        align: 'center' as const,
      })),
      { header: 'Sum', width: 40, align: 'right' },
      { header: 'Avg', width: 40, align: 'right' },
      { header: 'Rank', width: 35, align: 'center' },
      { header: 'Abs', width: 35, align: 'center' },
      { header: 'Cond', width: 35, align: 'center' },
    ];

    const PERIODS = [
      { key: 'term1', label: '1st' },
      { key: 'term2', label: '2nd' },
      { key: 'sem1Avg', label: 'Ave1' },
      { key: 'term3', label: '3rd' },
      { key: 'term4', label: '4th' },
      { key: 'sem2Avg', label: 'Ave2' },
      { key: 'yearlyAverage', label: 'Yearly' },
    ];

    const tableRows: string[][] = [];

    rosterData.students.forEach((student, index) => {
      const scoreMap = new Map<string, any>();
      (student.subjectScores || []).forEach((sc: any) => {
        scoreMap.set(sc.subjectId, sc);
      });

      PERIODS.forEach((period, pIndex) => {
        const isFirst = pIndex === 0;
        const isYearly = period.key === 'yearlyAverage';

        const subjectValues = rosterData.subjects.map((subj) => {
          const sc = scoreMap.get(subj.id);
          if (!sc) return '—';
          const raw = sc[period.key];
          if (raw == null) return '—';
          return typeof raw === 'number'
            ? period.key.includes('Avg') || isYearly
              ? raw.toFixed(1)
              : String(raw)
            : String(raw);
        });

        tableRows.push([
          isFirst ? String(index + 1) : '',
          isFirst ? student.admissionNo || '—' : '',
          isFirst ? student.studentName || '—' : '',
          isFirst ? (student.age != null ? String(student.age) : '—') : '',
          isFirst ? student.sex || '—' : '',
          period.label,
          ...subjectValues,
          isFirst && student.sum != null ? String(student.sum) : '',
          isFirst && student.average != null ? student.average.toFixed(1) : '',
          isFirst && student.rank != null ? `#${student.rank}` : '',
          isFirst ? `${student.absentDays ?? 0}` : '',
          isFirst ? student.conduct || '—' : '',
        ]);
      });
    });

    this.drawTable(doc, columns, tableRows, {
      rowHeight: 14,
      fontSize: 6.5,
    });

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Admin Roster Review Queue Summary PDF
  // ─────────────────────────────────────────────────────────────────────────────

  async generateRosterReviewsSummaryPdf(
    reviews: any[],
    academicYearName: string,
    filters?: { status?: string; search?: string },
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: 'Class Roster Review Queue',
        Author: this.institutionName,
      },
    });

    const metadataRows = [
      [
        { label: 'Academic Year', value: academicYearName || 'All Years' },
        { label: 'Review Status Filter', value: filters?.status || 'All Statuses' },
        { label: 'Search Query', value: filters?.search ? `"${filters.search}"` : 'None' },
        { label: 'Total Reviews in Queue', value: String(reviews.length) },
      ],
      [
        {
          label: 'Approved Rosters',
          value: String(reviews.filter((r) => r.status === 'APPROVED').length),
        },
        {
          label: 'Submitted Rosters',
          value: String(reviews.filter((r) => r.status === 'SUBMITTED_TO_ADMIN').length),
        },
        {
          label: 'Rejected / Returned',
          value: String(reviews.filter((r) => r.status === 'REJECTED').length),
        },
        {
          label: 'Draft / In-Progress',
          value: String(reviews.filter((r) => r.status === 'DRAFT' || !r.status).length),
        },
      ],
    ];

    this.drawHeaderBanner(doc, 'CLASS ROSTER REVIEW QUEUE & SUBMISSIONS', metadataRows);

    const columns: TableColumn[] = [
      { header: 'Class Section', width: 140, align: 'left' },
      { header: 'Academic Year', width: 85, align: 'left' },
      { header: 'Grade', width: 75, align: 'left' },
      { header: 'Homeroom Teacher', width: 140, align: 'left' },
      { header: 'Students', width: 55, align: 'center' },
      { header: 'Subjects Submitted', width: 105, align: 'center' },
      { header: 'Conduct Status', width: 85, align: 'center' },
      { header: 'Review Status', width: 84, align: 'center' },
    ];

    const rows = reviews.map((rev) => [
      rev.displayName || rev.sectionName || '—',
      rev.academicYear || rev.academicYearName || academicYearName || '—',
      rev.gradeLevelName || '—',
      rev.homeroomTeacher || 'Unassigned',
      String(rev.enrolledCount ?? 0),
      `${rev.submittedSubjects ?? 0} / ${rev.totalSubjects ?? 0} (${rev.subjectCompletion || rev.submissionStatus || 'none'})`,
      rev.conductCompletion || rev.conductStatus || 'none',
      rev.status === 'SUBMITTED_TO_ADMIN' ? 'Submitted' : rev.status || 'Draft',
    ]);

    this.drawTable(doc, columns, rows);

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Official Paper Roster PDF (Official Printable Sheet with Certification)
  // ─────────────────────────────────────────────────────────────────────────────

  async generateOfficialPaperRosterPdf(officialData: any): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 30,
      bufferPages: true,
      info: {
        Title: `Official Academic Roster - ${officialData.officialHeader?.sectionName || 'Class'}`,
        Author: this.institutionName,
      },
    });

    const header = officialData.officialHeader || {};
    const sectionName = header.sectionName || officialData.section?.name || '—';
    const gradeLevel = header.gradeLevel || officialData.section?.grade || '—';
    const academicYear = header.academicYear || '2025/2026';
    const homeroomTeacher = header.homeroomTeacher || officialData.section?.homeroomTeacher || 'Unassigned';

    const metadataRows = [
      [
        { label: 'Institution', value: header.institutionName || this.institutionName },
        { label: 'Document Title', value: header.documentTitle || 'STUDENT ACADEMIC ROSTER' },
        { label: 'Academic Year', value: academicYear },
        { label: 'Section / Grade', value: `${gradeLevel} - ${sectionName}` },
      ],
      [
        { label: 'Homeroom Teacher', value: homeroomTeacher },
        { label: 'Review ID', value: header.reviewId ? header.reviewId.substring(0, 12) : '—' },
        { label: 'Official Status', value: header.status || 'APPROVED ✓' },
        {
          label: 'Reviewed On',
          value: header.reviewedAt
            ? new Date(header.reviewedAt).toLocaleDateString()
            : '—',
        },
      ],
    ];

    this.drawHeaderBanner(doc, 'OFFICIAL CERTIFIED ACADEMIC ROSTER', metadataRows);

    const subjects = officialData.subjects || [];
    const students = officialData.students || [];

    const totalWidth = 781;
    const fixedWidth = 25 + 65 + 115 + 25 + 25 + 40 + 40 + 40 + 35 + 35 + 35; // 480
    const remainingWidth = Math.max(totalWidth - fixedWidth, 200);
    const subjectColWidth = subjects.length > 0 ? Math.floor(remainingWidth / subjects.length) : 40;

    const columns: TableColumn[] = [
      { header: '#', width: 25, align: 'center' },
      { header: 'Adm No', width: 65, align: 'left' },
      { header: 'Student Name', width: 115, align: 'left' },
      { header: 'Age', width: 25, align: 'center' },
      { header: 'Sex', width: 25, align: 'center' },
      { header: 'Period', width: 40, align: 'center' },
      ...subjects.map((s: any) => ({
        header: s.code || s.name.substring(0, 4),
        width: subjectColWidth,
        align: 'center' as const,
      })),
      { header: 'Sum', width: 40, align: 'right' },
      { header: 'Avg', width: 40, align: 'right' },
      { header: 'Rank', width: 35, align: 'center' },
      { header: 'Abs', width: 35, align: 'center' },
      { header: 'Cond', width: 35, align: 'center' },
    ];

    const PERIODS = [
      { key: 'term1', label: '1st' },
      { key: 'term2', label: '2nd' },
      { key: 'sem1Avg', label: 'Ave1' },
      { key: 'term3', label: '3rd' },
      { key: 'term4', label: '4th' },
      { key: 'sem2Avg', label: 'Ave2' },
      { key: 'yearlyAverage', label: 'Yearly' },
    ];

    const tableRows: string[][] = [];

    students.forEach((student: any, index: number) => {
      const scoreMap = new Map<string, any>();
      (student.subjectScores || []).forEach((sc: any) => {
        scoreMap.set(sc.subjectId, sc);
      });

      PERIODS.forEach((period, pIndex) => {
        const isFirst = pIndex === 0;
        const isYearly = period.key === 'yearlyAverage';

        const subjectValues = subjects.map((subj: any) => {
          const sc = scoreMap.get(subj.id);
          if (!sc) return '—';
          const raw = sc[period.key];
          if (raw == null) return '—';
          return typeof raw === 'number'
            ? period.key.includes('Avg') || isYearly
              ? raw.toFixed(1)
              : String(raw)
            : String(raw);
        });

        tableRows.push([
          isFirst ? String(index + 1) : '',
          isFirst ? student.admissionNo || '—' : '',
          isFirst ? student.studentName || '—' : '',
          isFirst ? (student.age != null ? String(student.age) : '—') : '',
          isFirst ? student.sex || '—' : '',
          period.label,
          ...subjectValues,
          isFirst && student.sum != null ? String(student.sum) : '',
          isFirst && student.average != null ? student.average.toFixed(1) : '',
          isFirst && student.rank != null ? `#${student.rank}` : '',
          isFirst ? `${student.absentDays ?? 0}` : '',
          isFirst ? student.conduct || '—' : '',
        ]);
      });
    });

    this.drawTable(doc, columns, tableRows, {
      rowHeight: 14,
      fontSize: 6.5,
    });

    // Check if signature block fits on current page
    if (doc.y + 70 > doc.page.height - 40) {
      doc.addPage();
    }

    doc.moveDown(1.5);
    const signY = doc.y;
    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin - doc.page.margins.right;
    const boxWidth = contentWidth / 2 - 20;

    // Homeroom Teacher Signature line
    doc
      .strokeColor(this.borderColor)
      .lineWidth(1)
      .moveTo(margin, signY + 30)
      .lineTo(margin + boxWidth, signY + 30)
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(this.textColor)
      .text('Homeroom Teacher Signature', margin, signY + 35)
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(this.mutedTextColor)
      .text(`Name: ${homeroomTeacher}`, margin, signY + 47);

    // Principal / Administrator Signature line
    const rightBoxX = margin + contentWidth - boxWidth;
    doc
      .strokeColor(this.borderColor)
      .lineWidth(1)
      .moveTo(rightBoxX, signY + 30)
      .lineTo(rightBoxX + boxWidth, signY + 30)
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(this.textColor)
      .text('School Principal / Academic Director Signature & Stamp', rightBoxX, signY + 35)
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(this.mutedTextColor)
      .text(`Date Verified: ${generatedDateStr}`, rightBoxX, signY + 47);

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Teacher Weekly Teaching Schedule PDF
  // ─────────────────────────────────────────────────────────────────────────────

  async generateTeacherSchedulePdf(
    scheduleData: {
      teacher: { id: string; fullName: string; staffId: string | null };
      academicYear: { id: string; year: string; isCurrent: boolean };
      totalWeeklyPeriods: number;
      entries: Array<{
        id: string;
        dayOfWeek: string;
        period: { periodNumber: number; name: string; startTime: string; endTime: string; isBreak?: boolean };
        subject: { id: string; name: string; code: string };
        classSection: { id: string; name: string; gradeLevel: string | null; effectiveRoom: string | null };
      }>;
    },
    filters?: { search?: string; day?: string },
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Teacher Schedule - ${scheduleData.teacher.fullName}`,
        Author: this.institutionName,
      },
    });

    const activeFilterStr = [
      filters?.day ? `Day: ${filters.day}` : null,
      filters?.search ? `Search: "${filters.search}"` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'None (All Classes)';

    const metadataRows = [
      [
        { label: 'Teacher Name', value: scheduleData.teacher.fullName },
        { label: 'Staff ID', value: scheduleData.teacher.staffId || '—' },
        {
          label: 'Academic Year',
          value: `${scheduleData.academicYear.year}${scheduleData.academicYear.isCurrent ? ' (Current)' : ''}`,
        },
        { label: 'Generated Date', value: generatedDateStr },
      ],
      [
        { label: 'Weekly Teaching Periods', value: String(scheduleData.totalWeeklyPeriods || scheduleData.entries.length) },
        { label: 'Active Filters', value: activeFilterStr },
        { label: 'Schedule Type', value: 'Personal Teaching Timetable' },
        { label: 'Status', value: 'Published' },
      ],
    ];

    this.drawHeaderBanner(doc, 'TEACHER WEEKLY TEACHING SCHEDULE', metadataRows);

    const DAY_ORDER: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    // Filter entries if filters specified
    let filteredEntries = [...scheduleData.entries];
    if (filters?.day) {
      const targetDay = filters.day.toUpperCase();
      filteredEntries = filteredEntries.filter(
        (e) => (e.dayOfWeek || '').toUpperCase() === targetDay,
      );
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      filteredEntries = filteredEntries.filter((e) => {
        const subj = (e.subject?.name || '').toLowerCase();
        const code = (e.subject?.code || '').toLowerCase();
        const sec = (e.classSection?.name || '').toLowerCase();
        const gr = (e.classSection?.gradeLevel || '').toLowerCase();
        const rm = (e.classSection?.effectiveRoom || '').toLowerCase();
        const day = (e.dayOfWeek || '').toLowerCase();
        return (
          subj.includes(q) ||
          code.includes(q) ||
          sec.includes(q) ||
          gr.includes(q) ||
          rm.includes(q) ||
          day.includes(q)
        );
      });
    }

    // Sort by day, then periodNumber
    filteredEntries.sort((a, b) => {
      const dayA = DAY_ORDER[(a.dayOfWeek || '').toUpperCase()] || 99;
      const dayB = DAY_ORDER[(b.dayOfWeek || '').toUpperCase()] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (a.period?.periodNumber ?? 0) - (b.period?.periodNumber ?? 0);
    });

    const columns: TableColumn[] = [
      { header: 'Day', width: 90, align: 'left' },
      { header: 'Period & Time', width: 150, align: 'left' },
      { header: 'Subject', width: 220, align: 'left' },
      { header: 'Class Section', width: 170, align: 'left' },
      { header: 'Assigned Room', width: 139, align: 'left' },
    ];

    const tableRows = filteredEntries.map((e) => {
      const periodLabel = e.period
        ? `Period ${e.period.periodNumber}: ${e.period.name || ''} (${e.period.startTime} - ${e.period.endTime})`
        : '—';
      const subjectLabel = e.subject
        ? `${e.subject.name}${e.subject.code ? ` (${e.subject.code})` : ''}`
        : '—';
      const classLabel = e.classSection
        ? `${e.classSection.name}${e.classSection.gradeLevel ? ` • ${e.classSection.gradeLevel}` : ''}`
        : '—';
      const roomLabel = e.classSection?.effectiveRoom || 'Main Classroom';

      return [
        e.dayOfWeek || '—',
        periodLabel,
        subjectLabel,
        classLabel,
        roomLabel,
      ];
    });

    this.drawTable(doc, columns, tableRows, {
      rowHeight: 18,
      fontSize: 8,
    });

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Student Class Schedule & Timetable PDF
  // ─────────────────────────────────────────────────────────────────────────────

  async generateStudentSchedulePdf(
    scheduleData: {
      student: { id: string; fullName: string; admissionNo: string };
      academicYear: { id: string; year: string; isCurrent: boolean };
      classSection: { id: string; name: string; gradeLevel: string | null; roomNumber: string | null } | null;
      periods: Array<{ id: string; periodNumber: number; name: string; startTime: string; endTime: string; isBreak: boolean }>;
      entries: Array<{
        id: string;
        dayOfWeek: string;
        period: { periodNumber: number; name: string; startTime: string; endTime: string; isBreak?: boolean };
        subject: { id: string; name: string; code: string };
        teacher: { id: string; firstName: string; lastName: string };
        effectiveRoom: string | null;
        roomOverride: string | null;
      }>;
    },
    filters?: { search?: string },
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Class Schedule - ${scheduleData.student.fullName}`,
        Author: this.institutionName,
      },
    });

    const activeFilterStr = filters?.search ? `Search: "${filters.search}"` : 'None (Full Schedule)';

    const metadataRows = [
      [
        { label: 'Student Name', value: scheduleData.student.fullName },
        { label: 'Admission No', value: scheduleData.student.admissionNo },
        {
          label: 'Class & Section',
          value: scheduleData.classSection
            ? `${scheduleData.classSection.name}${scheduleData.classSection.gradeLevel ? ` (${scheduleData.classSection.gradeLevel})` : ''}`
            : 'Unassigned',
        },
        { label: 'Homeroom', value: scheduleData.classSection?.roomNumber || '—' },
      ],
      [
        {
          label: 'Academic Year',
          value: `${scheduleData.academicYear.year}${scheduleData.academicYear.isCurrent ? ' (Current)' : ''}`,
        },
        { label: 'Weekly Classes', value: String(scheduleData.entries.length) },
        { label: 'Search Query', value: activeFilterStr },
        { label: 'Generated Date', value: generatedDateStr },
      ],
    ];

    this.drawHeaderBanner(doc, 'STUDENT CLASS SCHEDULE & TIMETABLE', metadataRows);

    const DAY_ORDER: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    let filteredEntries = [...scheduleData.entries];
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      filteredEntries = filteredEntries.filter((e) => {
        const subj = (e.subject?.name || '').toLowerCase();
        const code = (e.subject?.code || '').toLowerCase();
        const tFirst = (e.teacher?.firstName || '').toLowerCase();
        const tLast = (e.teacher?.lastName || '').toLowerCase();
        const rm = (e.effectiveRoom || e.roomOverride || scheduleData.classSection?.roomNumber || '').toLowerCase();
        const day = (e.dayOfWeek || '').toLowerCase();
        return (
          subj.includes(q) ||
          code.includes(q) ||
          tFirst.includes(q) ||
          tLast.includes(q) ||
          rm.includes(q) ||
          day.includes(q)
        );
      });
    }

    filteredEntries.sort((a, b) => {
      const dayA = DAY_ORDER[(a.dayOfWeek || '').toUpperCase()] || 99;
      const dayB = DAY_ORDER[(b.dayOfWeek || '').toUpperCase()] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (a.period?.periodNumber ?? 0) - (b.period?.periodNumber ?? 0);
    });

    const columns: TableColumn[] = [
      { header: 'Day', width: 90, align: 'left' },
      { header: 'Period & Time', width: 150, align: 'left' },
      { header: 'Subject', width: 220, align: 'left' },
      { header: 'Instructor / Teacher', width: 170, align: 'left' },
      { header: 'Room', width: 139, align: 'left' },
    ];

    const tableRows = filteredEntries.map((e) => {
      const periodLabel = e.period
        ? `Period ${e.period.periodNumber}: ${e.period.name || ''} (${e.period.startTime} - ${e.period.endTime})`
        : '—';
      const subjectLabel = e.subject
        ? `${e.subject.name}${e.subject.code ? ` (${e.subject.code})` : ''}`
        : '—';
      const teacherLabel = e.teacher
        ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim()
        : 'Assigned Faculty';
      const roomLabel = e.effectiveRoom || e.roomOverride || scheduleData.classSection?.roomNumber || 'Main Room';

      return [
        e.dayOfWeek || '—',
        periodLabel,
        subjectLabel,
        teacherLabel,
        roomLabel,
      ];
    });

    this.drawTable(doc, columns, tableRows, {
      rowHeight: 18,
      fontSize: 8,
    });

    return this.finalizeDocument(doc, generatedDateStr);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Class Section Schedule Timetable PDF (For Teacher "Class Timetables" View)
  // ─────────────────────────────────────────────────────────────────────────────

  async generateSectionSchedulePdf(
    sectionScheduleData: {
      classSection: { id: string; name: string; roomNumber: string | null; gradeLevel?: { name: string } | null };
      academicYear: { id: string; year: string; isCurrent: boolean; [key: string]: any };
      status?: string;
      periods: Array<{ id: string; periodNumber: number; name: string; startTime: string; endTime: string; isBreak: boolean }>;
      entries: Array<{
        id: string;
        dayOfWeek: string;
        period: { periodNumber: number; name: string; startTime: string; endTime: string; isBreak?: boolean };
        subject: { id: string; name: string; code: string };
        teacher: { id: string; firstName: string; lastName: string };
        effectiveRoom?: string | null;
        roomOverride?: string | null;
      }>;
    },
    filters?: { search?: string; day?: string },
  ): Promise<Buffer> {
    const generatedDateStr = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const sectionName = sectionScheduleData.classSection?.name || 'Class Section';
    const gradeLevel = sectionScheduleData.classSection?.gradeLevel?.name || '—';

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Class Schedule - ${sectionName}`,
        Author: this.institutionName,
      },
    });

    const activeFilterStr = [
      filters?.day ? `Day: ${filters.day}` : null,
      filters?.search ? `Search: "${filters.search}"` : null,
    ]
      .filter(Boolean)
      .join(', ') || 'None (All Periods)';

    const metadataRows = [
      [
        { label: 'Class Section', value: sectionName },
        { label: 'Grade Level', value: gradeLevel },
        { label: 'Homeroom', value: sectionScheduleData.classSection?.roomNumber || '—' },
        {
          label: 'Academic Year',
          value: `${sectionScheduleData.academicYear.year}${sectionScheduleData.academicYear.isCurrent ? ' (Current)' : ''}`,
        },
      ],
      [
        { label: 'Weekly Periods', value: String(sectionScheduleData.entries.length) },
        { label: 'Schedule Status', value: sectionScheduleData.status || 'PUBLISHED' },
        { label: 'Active Filters', value: activeFilterStr },
        { label: 'Generated Date', value: generatedDateStr },
      ],
    ];

    this.drawHeaderBanner(doc, 'CLASS SECTION TIMETABLE', metadataRows);

    const DAY_ORDER: Record<string, number> = {
      MONDAY: 1,
      TUESDAY: 2,
      WEDNESDAY: 3,
      THURSDAY: 4,
      FRIDAY: 5,
      SATURDAY: 6,
      SUNDAY: 7,
    };

    let filteredEntries = [...sectionScheduleData.entries];
    if (filters?.day) {
      const targetDay = filters.day.toUpperCase();
      filteredEntries = filteredEntries.filter(
        (e) => (e.dayOfWeek || '').toUpperCase() === targetDay,
      );
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      filteredEntries = filteredEntries.filter((e) => {
        const subj = (e.subject?.name || '').toLowerCase();
        const code = (e.subject?.code || '').toLowerCase();
        const tFirst = (e.teacher?.firstName || '').toLowerCase();
        const tLast = (e.teacher?.lastName || '').toLowerCase();
        const rm = (e.effectiveRoom || e.roomOverride || sectionScheduleData.classSection?.roomNumber || '').toLowerCase();
        const day = (e.dayOfWeek || '').toLowerCase();
        return (
          subj.includes(q) ||
          code.includes(q) ||
          tFirst.includes(q) ||
          tLast.includes(q) ||
          rm.includes(q) ||
          day.includes(q)
        );
      });
    }

    filteredEntries.sort((a, b) => {
      const dayA = DAY_ORDER[(a.dayOfWeek || '').toUpperCase()] || 99;
      const dayB = DAY_ORDER[(b.dayOfWeek || '').toUpperCase()] || 99;
      if (dayA !== dayB) return dayA - dayB;
      return (a.period?.periodNumber ?? 0) - (b.period?.periodNumber ?? 0);
    });

    const columns: TableColumn[] = [
      { header: 'Day', width: 90, align: 'left' },
      { header: 'Period & Time', width: 150, align: 'left' },
      { header: 'Subject', width: 220, align: 'left' },
      { header: 'Teacher / Instructor', width: 170, align: 'left' },
      { header: 'Room', width: 139, align: 'left' },
    ];

    const tableRows = filteredEntries.map((e) => {
      const periodLabel = e.period
        ? `Period ${e.period.periodNumber}: ${e.period.name || ''} (${e.period.startTime} - ${e.period.endTime})`
        : '—';
      const subjectLabel = e.subject
        ? `${e.subject.name}${e.subject.code ? ` (${e.subject.code})` : ''}`
        : '—';
      const teacherLabel = e.teacher
        ? `${e.teacher.firstName} ${e.teacher.lastName}`.trim()
        : 'Assigned Faculty';
      const roomLabel = e.effectiveRoom || e.roomOverride || sectionScheduleData.classSection?.roomNumber || 'Main Room';

      return [
        e.dayOfWeek || '—',
        periodLabel,
        subjectLabel,
        teacherLabel,
        roomLabel,
      ];
    });

    this.drawTable(doc, columns, tableRows, {
      rowHeight: 18,
      fontSize: 8,
    });

    return this.finalizeDocument(doc, generatedDateStr);
  }
}
