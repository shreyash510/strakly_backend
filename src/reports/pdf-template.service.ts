import { Injectable } from '@nestjs/common';
import { FullReportData } from './dto/pdf-report.dto';
import { getCurrencySymbol } from '../common/constants/currencies';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';

/* ─── Color Palette ────────────────────────────── */
const C = {
  primary: '#6366f1',
  text: '#1a1a2e',
  green: '#16a34a',
  red: '#dc2626',
  muted: '#64748b',
  headerBg: '#f1f5f9',
  cardBg: '#f8fafc',
  border: '#e2e8f0',
  badgeGreen: { bg: '#dcfce7', text: '#166534' },
  badgeRed: { bg: '#fee2e2', text: '#991b1b' },
  badgeBlue: { bg: '#dbeafe', text: '#1e40af' },
  badgePurple: { bg: '#f3e8ff', text: '#6b21a8' },
  badgeOrange: { bg: '#ffedd5', text: '#9a3412' },
  highlightBg: '#fffbeb',
};

@Injectable()
export class PdfTemplateService {
  buildDocDefinition(data: FullReportData): TDocumentDefinitions {
    const { gymInfo, period, dashboardSummary, incomeExpense, membershipSales, paymentDues, attendanceReport, trainerStaffReport, generatedAt, branchName } = data;
    const currency = gymInfo.currency || 'USD';

    const periodLabel = period.month
      ? `${this.getMonthName(period.month)} ${period.year}`
      : `Year ${period.year}`;

    const generatedDate = new Date(generatedAt).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const content: Content[] = [];

    /* ═══ Header Bar ═══ */
    content.push(this.buildHeader(gymInfo, periodLabel, branchName, generatedDate));
    content.push({ text: '', margin: [0, 0, 0, 16] });

    /* ═══ Dashboard Summary ═══ */
    content.push(this.sectionTitle('Dashboard Summary'));
    content.push(this.buildCards([
      { label: 'Active Clients', value: String(dashboardSummary.activeMembers) },
      { label: 'New This Month', value: String(dashboardSummary.newMembersThisMonth) },
      { label: 'Expired', value: String(dashboardSummary.expiredMemberships), color: C.red },
      { label: 'Monthly Revenue', value: this.fmt(dashboardSummary.monthlyRevenue, currency), color: C.green },
      { label: 'Pending Dues', value: this.fmt(dashboardSummary.pendingDues, currency), color: C.red },
      { label: 'Present Today', value: String(dashboardSummary.attendanceToday) },
    ]));

    /* ═══ Income & Expense ═══ */
    content.push(this.sectionTitle('Income & Expense Report'));
    content.push(this.buildCards([
      { label: 'Total Income', value: this.fmt(incomeExpense.income.totalIncome, currency), color: C.green },
      { label: 'Total Expense', value: this.fmt(incomeExpense.expense.totalExpense, currency), color: C.red },
      { label: `Net ${incomeExpense.netProfit >= 0 ? 'Profit' : 'Loss'}`, value: this.fmt(Math.abs(incomeExpense.netProfit), currency), color: incomeExpense.netProfit >= 0 ? C.green : C.red },
    ]));

    if (incomeExpense.breakdown.incomeByMonth.length > 0) {
      content.push({
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Income by Month', style: 'subheading' },
              this.buildTable(
                ['Month', { text: 'Amount', alignment: 'right' as const }],
                incomeExpense.breakdown.incomeByMonth.map(item => [
                  item.month,
                  { text: this.fmt(item.amount, currency), alignment: 'right' as const, color: C.green },
                ]),
              ),
            ],
          },
          { width: 16, text: '' },
          {
            width: '*',
            stack: [
              { text: 'Expense by Month', style: 'subheading' },
              incomeExpense.breakdown.expenseByMonth.length > 0
                ? this.buildTable(
                    ['Month', { text: 'Amount', alignment: 'right' as const }],
                    incomeExpense.breakdown.expenseByMonth.map(item => [
                      item.month,
                      { text: this.fmt(item.amount, currency), alignment: 'right' as const, color: C.red },
                    ]),
                  )
                : { text: 'No expense data', color: C.muted, fontSize: 10, margin: [0, 4, 0, 8] as [number, number, number, number] },
            ],
          },
        ],
        margin: [0, 0, 0, 12] as [number, number, number, number],
      });
    }

    if (incomeExpense.breakdown.incomeByPaymentMethod.length > 0) {
      content.push({ text: 'Income by Payment Method', style: 'subheading' });
      content.push(this.buildTable(
        ['Method', { text: 'Amount', alignment: 'right' as const }, { text: 'Transactions', alignment: 'right' as const }],
        incomeExpense.breakdown.incomeByPaymentMethod.map(item => [
          this.badge(item.method, C.badgeBlue),
          { text: this.fmt(item.amount, currency), alignment: 'right' as const },
          { text: String(item.count), alignment: 'right' as const },
        ]),
      ));
    }

    /* ═══ Membership Sales (page break) ═══ */
    content.push({ text: '', pageBreak: 'before' });
    content.push(this.sectionTitle('Membership Sales Report'));
    content.push(this.buildCards([
      { label: 'Total Sales', value: String(membershipSales.summary.totalSales) },
      { label: 'Total Revenue', value: this.fmt(membershipSales.summary.totalRevenue, currency), color: C.green },
      { label: 'Avg Order Value', value: this.fmt(membershipSales.summary.averageOrderValue, currency) },
      { label: 'New Memberships', value: String(membershipSales.summary.newMemberships) },
    ]));

    if (membershipSales.topPerformingPlan) {
      const tp = membershipSales.topPerformingPlan;
      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: '🏆 Top Performing Plan', fontSize: 9, color: '#92400e', bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
              { text: tp.planName, fontSize: 14, bold: true },
              { text: `${this.fmt(tp.revenue, currency)} revenue • ${tp.count} sales`, fontSize: 10, color: C.muted },
            ],
            fillColor: C.highlightBg,
            margin: [12, 10, 12, 10] as [number, number, number, number],
          }]],
        },
        layout: { hLineWidth: () => 1, vLineWidth: () => 1, hLineColor: () => C.border, vLineColor: () => C.border },
        margin: [0, 0, 0, 12] as [number, number, number, number],
      } as Content);
    }

    if (membershipSales.salesByPlan.length > 0) {
      content.push({ text: 'Sales by Plan', style: 'subheading' });
      content.push(this.buildTable(
        ['Plan', { text: 'Sales', alignment: 'right' as const }, { text: 'Revenue', alignment: 'right' as const }, { text: 'Share', alignment: 'right' as const }],
        membershipSales.salesByPlan.map(plan => [
          { text: [{ text: plan.planName, bold: true }, ' ', this.badge(plan.planCode, C.badgePurple)] },
          { text: String(plan.count), alignment: 'right' as const },
          { text: this.fmt(plan.revenue, currency), alignment: 'right' as const, color: C.green },
          { text: `${plan.percentage}%`, alignment: 'right' as const },
        ]),
      ));
    }

    if (membershipSales.salesByMonth.length > 0) {
      content.push({ text: 'Monthly Sales Trend', style: 'subheading' });
      content.push(this.buildTable(
        ['Month', { text: 'Sales', alignment: 'right' as const }, { text: 'Revenue', alignment: 'right' as const }],
        membershipSales.salesByMonth.map(item => [
          item.month,
          { text: String(item.count), alignment: 'right' as const },
          { text: this.fmt(item.revenue, currency), alignment: 'right' as const, color: C.green },
        ]),
      ));
    }

    /* ═══ Payment Dues (page break) ═══ */
    content.push({ text: '', pageBreak: 'before' });
    content.push(this.sectionTitle('Payment Dues Report'));
    content.push(this.buildCards([
      { label: 'Total Due', value: this.fmt(paymentDues.summary.totalDueAmount, currency), color: C.red },
      { label: 'Membership Dues', value: this.fmt(paymentDues.summary.membershipDues, currency), color: C.red },
      { label: 'Salary Dues', value: this.fmt(paymentDues.summary.salaryDues, currency), color: C.red },
      { label: 'Overdue', value: String(paymentDues.summary.overdueCount), color: C.red },
    ]));

    if (paymentDues.membershipDues.length > 0) {
      content.push({ text: `Membership Dues (${paymentDues.membershipDues.length})`, style: 'subheading' });
      content.push(this.buildTable(
        ['Client', 'Plan', { text: 'Amount', alignment: 'right' as const }, 'Due Date', 'Status'],
        paymentDues.membershipDues.map(due => [
          { text: [{ text: due.clientName, bold: true }, '\n', { text: due.clientEmail, fontSize: 9, color: C.muted }] },
          this.badge(due.planName, C.badgePurple),
          { text: this.fmt(due.amount, currency), alignment: 'right' as const, color: C.red },
          due.dueDate,
          due.daysOverdue > 0
            ? this.badge(`${due.daysOverdue}d overdue`, C.badgeRed)
            : this.badge('Pending', C.badgeOrange),
        ]),
      ));
    } else {
      content.push({ text: 'No pending membership dues.', color: C.muted, fontSize: 10, margin: [0, 0, 0, 12] as [number, number, number, number] });
    }

    if (paymentDues.salaryDues.length > 0) {
      content.push({ text: `Salary Dues (${paymentDues.salaryDues.length})`, style: 'subheading', margin: [0, 12, 0, 8] as [number, number, number, number] });
      content.push(this.buildTable(
        ['Staff', 'Role', 'Period', { text: 'Amount', alignment: 'right' as const }],
        paymentDues.salaryDues.map(due => [
          { text: [{ text: due.staffName, bold: true }, '\n', { text: due.staffEmail, fontSize: 9, color: C.muted }] },
          this.badge(due.staffRole, C.badgeBlue),
          due.period,
          { text: this.fmt(due.amount, currency), alignment: 'right' as const, color: C.red },
        ]),
      ));
    } else {
      content.push({ text: 'No pending salary dues.', color: C.muted, fontSize: 10, margin: [0, 0, 0, 12] as [number, number, number, number] });
    }

    /* ═══ Attendance Report (page break) ═══ */
    content.push({ text: '', pageBreak: 'before' });
    content.push(this.sectionTitle('Attendance Report'));
    content.push(this.buildCards([
      { label: 'Total Check-Ins', value: String(attendanceReport.summary.totalCheckIns) },
      { label: 'Avg Daily', value: attendanceReport.summary.avgDailyCheckIns.toFixed(1) },
      { label: 'Unique Clients', value: String(attendanceReport.summary.uniqueMembers) },
      { label: 'Avg Duration', value: `${attendanceReport.summary.avgDuration} min` },
    ]));

    if (attendanceReport.weeklyPattern.length > 0) {
      content.push({ text: 'Weekly Pattern', style: 'subheading' });
      content.push({
        columns: attendanceReport.weeklyPattern.map(day => ({
          width: '*',
          stack: [
            { text: day.day.substring(0, 3), fontSize: 9, color: C.muted, bold: true, alignment: 'center' as const },
            { text: String(day.count), fontSize: 14, bold: true, alignment: 'center' as const },
          ],
          margin: [2, 6, 2, 6] as [number, number, number, number],
        })),
        margin: [0, 0, 0, 12] as [number, number, number, number],
      } as Content);
    }

    if (attendanceReport.genderDistribution) {
      const gd = attendanceReport.genderDistribution;
      content.push({ text: 'Gender Distribution', style: 'subheading' });
      content.push(this.buildCards([
        { label: 'Male', value: String(gd.male) },
        { label: 'Female', value: String(gd.female) },
        { label: 'Other', value: String(gd.other) },
      ]));
    }

    if (attendanceReport.dailyTrend.length > 0) {
      content.push({ text: 'Daily Attendance Trend', style: 'subheading' });
      content.push(this.buildTable(
        ['Date', { text: 'Check-Ins', alignment: 'right' as const }],
        attendanceReport.dailyTrend.slice(0, 30).map(day => [
          day.date,
          { text: String(day.count), alignment: 'right' as const },
        ]),
      ));
    }

    if (attendanceReport.topMembers.length > 0) {
      content.push({ text: 'Top Clients by Visits', style: 'subheading' });
      content.push(this.buildTable(
        ['#', 'Client', { text: 'Visits', alignment: 'right' as const }],
        attendanceReport.topMembers.slice(0, 10).map((member, i) => [
          String(i + 1),
          member.name,
          { text: String(member.visits), alignment: 'right' as const, bold: true },
        ]),
      ));
    }

    /* ═══ Trainer & Staff Report (page break) ═══ */
    if (trainerStaffReport.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(this.sectionTitle('Trainer & Staff Report'));
      content.push(this.buildTable(
        ['Name', 'Role', { text: 'Assigned Clients', alignment: 'right' as const }, { text: 'Salary Paid (Year)', alignment: 'right' as const }],
        trainerStaffReport.map(staff => [
          { text: [{ text: staff.name, bold: true }, '\n', { text: staff.email, fontSize: 9, color: C.muted }] },
          this.badge(staff.role, C.badgeBlue),
          { text: String(staff.clientCount), alignment: 'right' as const },
          { text: this.fmt(staff.totalSalaryPaid, currency), alignment: 'right' as const, color: C.green },
        ]),
      ));
    }

    /* ═══ Footer line ═══ */
    content.push({
      text: `Generated by Strakly • ${new Date(generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      alignment: 'center',
      color: '#94a3b8',
      fontSize: 9,
      margin: [0, 24, 0, 0],
    });

    return {
      pageSize: 'A4',
      pageMargins: [42, 42, 42, 60], // ~15mm sides, 15mm top, 21mm bottom
      defaultStyle: {
        font: 'Roboto',
        fontSize: 11,
        color: C.text,
        lineHeight: 1.4,
      },
      styles: {
        subheading: {
          fontSize: 11,
          bold: true,
          color: '#334155',
          margin: [0, 4, 0, 6],
        },
      },
      footer: (currentPage: number, pageCount: number) => ({
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'center' as const,
        fontSize: 9,
        color: '#94a3b8',
        margin: [0, 16, 0, 0] as [number, number, number, number],
      }),
      content,
    };
  }

  /* ─── Helper: Header bar ────────────────────── */
  private buildHeader(gymInfo: FullReportData['gymInfo'], periodLabel: string, branchName: string | null, generatedDate: string): Content {
    const addressParts: string[] = [];
    if (gymInfo.address) addressParts.push(gymInfo.address);
    if (gymInfo.city) addressParts.push(gymInfo.city);
    if (gymInfo.state) addressParts.push(gymInfo.state);
    const meta: string[] = [];
    if (addressParts.length) meta.push(addressParts.join(', '));
    if (gymInfo.phone) meta.push(gymInfo.phone);
    if (gymInfo.email) meta.push(gymInfo.email);

    return {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: gymInfo.name, fontSize: 22, bold: true, color: '#ffffff' },
            { text: `Comprehensive Report — ${periodLabel}${branchName ? ` — ${branchName}` : ''}`, fontSize: 11, color: '#ffffffd9', margin: [0, 2, 0, 0] as [number, number, number, number] },
            ...(meta.length || generatedDate ? [{
              text: `${meta.join(' • ')}${meta.length ? '\n' : ''}Generated on ${generatedDate}`,
              fontSize: 9, color: '#ffffffb3', margin: [0, 8, 0, 0] as [number, number, number, number],
            }] : []),
          ],
          fillColor: C.primary,
          margin: [20, 18, 20, 18] as [number, number, number, number],
        }]],
      },
      layout: 'noBorders',
    } as Content;
  }

  /* ─── Helper: Section title ─────────────────── */
  private sectionTitle(title: string): Content {
    return {
      stack: [
        { text: title, fontSize: 15, bold: true, color: C.primary, margin: [0, 0, 0, 4] as [number, number, number, number] },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: C.primary }] },
      ],
      margin: [0, 16, 0, 10] as [number, number, number, number],
    } as Content;
  }

  /* ─── Helper: Metric cards (as a table row) ─── */
  private buildCards(items: { label: string; value: string; color?: string }[]): Content {
    return {
      table: {
        widths: items.map(() => '*'),
        body: [
          items.map(item => ({
            stack: [
              { text: item.label.toUpperCase(), fontSize: 8, color: C.muted, letterSpacing: 0.3, margin: [0, 0, 0, 3] as [number, number, number, number] },
              { text: item.value, fontSize: 16, bold: true, color: item.color || C.text },
            ],
            fillColor: C.cardBg,
            margin: [10, 8, 10, 8] as [number, number, number, number],
          } as TableCell)),
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => C.border,
        vLineColor: () => C.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 14] as [number, number, number, number],
    } as Content;
  }

  /* ─── Helper: Data table ────────────────────── */
  private buildTable(headers: (string | { text: string; alignment?: string })[], rows: any[][]): Content {
    const headerRow: TableCell[] = headers.map(h => {
      const obj = typeof h === 'string' ? { text: h } : h;
      return {
        text: obj.text.toUpperCase(),
        fontSize: 9,
        bold: true,
        color: '#334155',
        fillColor: C.headerBg,
        alignment: (obj as any).alignment || 'left',
        margin: [8, 7, 8, 7] as [number, number, number, number],
      } as TableCell;
    });

    const dataRows = rows.map((row, rowIndex) =>
      row.map(cell => {
        const base = typeof cell === 'string' ? { text: cell } : cell;
        return {
          ...base,
          fontSize: base.fontSize || 10,
          fillColor: rowIndex % 2 === 1 ? '#fafbfc' : undefined,
          margin: base.margin || [8, 6, 8, 6] as [number, number, number, number],
        } as TableCell;
      }),
    );

    return {
      table: {
        headerRows: 1,
        widths: headers.map(() => '*'),
        body: [headerRow, ...dataRows],
      },
      layout: {
        hLineWidth: (i: number, node: any) => i === 1 ? 2 : 1,
        vLineWidth: () => 0,
        hLineColor: (i: number, node: any) => i === 1 ? C.border : '#f1f5f9',
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 12] as [number, number, number, number],
    } as Content;
  }

  /* ─── Helper: Badge ─────────────────────────── */
  private badge(text: string, colors: { bg: string; text: string }): Content {
    return {
      text: text,
      fontSize: 9,
      bold: true,
      color: colors.text,
      background: colors.bg,
    } as any;
  }

  /* ─── Helper: Format currency ───────────────── */
  private fmt(amount: number, currency: string = 'USD'): string {
    const symbol = getCurrencySymbol(currency);
    return `${symbol} ${new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)}`;
  }

  /* ─── Helper: Month name ────────────────────── */
  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1] || '';
  }
}
