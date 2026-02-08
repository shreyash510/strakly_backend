import { Injectable } from '@nestjs/common';
import { FullReportData } from './dto/pdf-report.dto';

@Injectable()
export class PdfTemplateService {
  buildFullReportHtml(data: FullReportData): string {
    const { gymInfo, period, dashboardSummary, incomeExpense, membershipSales, paymentDues, attendanceReport, trainerStaffReport, generatedAt, branchName } = data;

    const periodLabel = period.month
      ? `${this.getMonthName(period.month)} ${period.year}`
      : `Year ${period.year}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a2e; font-size: 12px; line-height: 1.5; background: #fff; }

  .header-bar { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: #fff; padding: 32px; border-radius: 12px; margin-bottom: 28px; }
  .header-bar h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; }
  .header-bar .sub { font-size: 13px; opacity: 0.85; }
  .header-bar .meta { margin-top: 12px; font-size: 11px; opacity: 0.7; }

  .section { margin-bottom: 28px; }
  .section-title { font-size: 17px; font-weight: 700; color: #1a1a2e; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 2px solid #6366f1; }

  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .card { flex: 1; min-width: 140px; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
  .card .label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .card .value { font-size: 20px; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11.5px; }
  thead th { background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; color: #334155; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; }
  tbody td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
  tbody tr:nth-child(even) { background: #fafbfc; }

  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-purple { background: #f3e8ff; color: #6b21a8; }
  .badge-orange { background: #ffedd5; color: #9a3412; }

  .text-green { color: #16a34a; }
  .text-red { color: #dc2626; }
  .text-muted { color: #64748b; font-size: 11px; }

  .highlight-box { padding: 14px 18px; border-radius: 10px; border: 1px solid #e2e8f0; background: #fffbeb; margin-bottom: 16px; }

  .page-break { page-break-before: always; }

  .footer { text-align: center; color: #94a3b8; font-size: 10px; margin-top: 32px; padding-top: 12px; border-top: 1px solid #e2e8f0; }

  .two-col { display: flex; gap: 16px; }
  .two-col > div { flex: 1; }

  .progress-bar-container { background: #e2e8f0; border-radius: 4px; height: 6px; margin-top: 4px; }
  .progress-bar { background: #6366f1; border-radius: 4px; height: 6px; }

  .weekly-grid { display: flex; gap: 8px; margin-bottom: 16px; }
  .weekly-item { flex: 1; text-align: center; padding: 10px 6px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
  .weekly-item .day { font-size: 10px; color: #64748b; font-weight: 600; }
  .weekly-item .count { font-size: 16px; font-weight: 700; color: #1a1a2e; margin-top: 2px; }
</style>
</head>
<body>

<!-- Header -->
<div class="header-bar">
  <h1>${this.escapeHtml(gymInfo.name)}</h1>
  <div class="sub">Comprehensive Report &mdash; ${periodLabel}${branchName ? ` &mdash; ${this.escapeHtml(branchName)}` : ''}</div>
  <div class="meta">
    ${gymInfo.address ? `${this.escapeHtml(gymInfo.address)}${gymInfo.city ? `, ${this.escapeHtml(gymInfo.city)}` : ''}${gymInfo.state ? `, ${this.escapeHtml(gymInfo.state)}` : ''}` : ''}
    ${gymInfo.phone ? ` &bull; ${this.escapeHtml(gymInfo.phone)}` : ''}
    ${gymInfo.email ? ` &bull; ${this.escapeHtml(gymInfo.email)}` : ''}
    <br>Generated on ${new Date(generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
  </div>
</div>

<!-- Dashboard Summary -->
<div class="section">
  <div class="section-title">Dashboard Summary</div>
  <div class="cards">
    <div class="card">
      <div class="label">Active Members</div>
      <div class="value">${dashboardSummary.activeMembers}</div>
    </div>
    <div class="card">
      <div class="label">New This Month</div>
      <div class="value">${dashboardSummary.newMembersThisMonth}</div>
    </div>
    <div class="card">
      <div class="label">Expired</div>
      <div class="value text-red">${dashboardSummary.expiredMemberships}</div>
    </div>
    <div class="card">
      <div class="label">Monthly Revenue</div>
      <div class="value text-green">${this.formatCurrency(dashboardSummary.monthlyRevenue)}</div>
    </div>
    <div class="card">
      <div class="label">Pending Dues</div>
      <div class="value text-red">${this.formatCurrency(dashboardSummary.pendingDues)}</div>
    </div>
    <div class="card">
      <div class="label">Present Today</div>
      <div class="value">${dashboardSummary.attendanceToday}</div>
    </div>
  </div>
</div>

<!-- Income & Expense -->
<div class="section">
  <div class="section-title">Income & Expense Report</div>
  <div class="cards">
    <div class="card">
      <div class="label">Total Income</div>
      <div class="value text-green">${this.formatCurrency(incomeExpense.income.totalIncome)}</div>
    </div>
    <div class="card">
      <div class="label">Total Expense</div>
      <div class="value text-red">${this.formatCurrency(incomeExpense.expense.totalExpense)}</div>
    </div>
    <div class="card">
      <div class="label">Net ${incomeExpense.netProfit >= 0 ? 'Profit' : 'Loss'}</div>
      <div class="value ${incomeExpense.netProfit >= 0 ? 'text-green' : 'text-red'}">${this.formatCurrency(Math.abs(incomeExpense.netProfit))}</div>
    </div>
  </div>

  ${incomeExpense.breakdown.incomeByMonth.length > 0 ? `
  <div class="two-col">
    <div>
      <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Income by Month</h4>
      <table>
        <thead><tr><th>Month</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>
          ${incomeExpense.breakdown.incomeByMonth.map(item => `
            <tr><td>${item.month}</td><td style="text-align:right;" class="text-green">${this.formatCurrency(item.amount)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div>
      <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Expense by Month</h4>
      <table>
        <thead><tr><th>Month</th><th style="text-align:right;">Amount</th></tr></thead>
        <tbody>
          ${incomeExpense.breakdown.expenseByMonth.length > 0
            ? incomeExpense.breakdown.expenseByMonth.map(item => `
              <tr><td>${item.month}</td><td style="text-align:right;" class="text-red">${this.formatCurrency(item.amount)}</td></tr>
            `).join('')
            : '<tr><td colspan="2" class="text-muted">No expense data</td></tr>'
          }
        </tbody>
      </table>
    </div>
  </div>` : ''}

  ${incomeExpense.breakdown.incomeByPaymentMethod.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Income by Payment Method</h4>
  <table>
    <thead><tr><th>Method</th><th style="text-align:right;">Amount</th><th style="text-align:right;">Transactions</th></tr></thead>
    <tbody>
      ${incomeExpense.breakdown.incomeByPaymentMethod.map(item => `
        <tr>
          <td><span class="badge badge-blue">${this.escapeHtml(item.method)}</span></td>
          <td style="text-align:right;">${this.formatCurrency(item.amount)}</td>
          <td style="text-align:right;">${item.count}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}
</div>

<!-- Membership Sales - Page Break -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Membership Sales Report</div>
  <div class="cards">
    <div class="card">
      <div class="label">Total Sales</div>
      <div class="value">${membershipSales.summary.totalSales}</div>
    </div>
    <div class="card">
      <div class="label">Total Revenue</div>
      <div class="value text-green">${this.formatCurrency(membershipSales.summary.totalRevenue)}</div>
    </div>
    <div class="card">
      <div class="label">Avg Order Value</div>
      <div class="value">${this.formatCurrency(membershipSales.summary.averageOrderValue)}</div>
    </div>
    <div class="card">
      <div class="label">New Memberships</div>
      <div class="value">${membershipSales.summary.newMemberships}</div>
    </div>
  </div>

  ${membershipSales.topPerformingPlan ? `
  <div class="highlight-box">
    <div style="font-size:11px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">&#127942; Top Performing Plan</div>
    <div style="font-size:16px;font-weight:700;">${this.escapeHtml(membershipSales.topPerformingPlan.planName)}</div>
    <div class="text-muted">${this.formatCurrency(membershipSales.topPerformingPlan.revenue)} revenue &bull; ${membershipSales.topPerformingPlan.count} sales</div>
  </div>` : ''}

  ${membershipSales.salesByPlan.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Sales by Plan</h4>
  <table>
    <thead><tr><th>Plan</th><th style="text-align:right;">Sales</th><th style="text-align:right;">Revenue</th><th style="text-align:right;">Share</th></tr></thead>
    <tbody>
      ${membershipSales.salesByPlan.map(plan => `
        <tr>
          <td><strong>${this.escapeHtml(plan.planName)}</strong> <span class="badge badge-purple">${this.escapeHtml(plan.planCode)}</span></td>
          <td style="text-align:right;">${plan.count}</td>
          <td style="text-align:right;" class="text-green">${this.formatCurrency(plan.revenue)}</td>
          <td style="text-align:right;">${plan.percentage}%</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}

  ${membershipSales.salesByMonth.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Monthly Sales Trend</h4>
  <table>
    <thead><tr><th>Month</th><th style="text-align:right;">Sales</th><th style="text-align:right;">Revenue</th></tr></thead>
    <tbody>
      ${membershipSales.salesByMonth.map(item => `
        <tr>
          <td>${item.month}</td>
          <td style="text-align:right;">${item.count}</td>
          <td style="text-align:right;" class="text-green">${this.formatCurrency(item.revenue)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}
</div>

<!-- Payment Dues - Page Break -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Payment Dues Report</div>
  <div class="cards">
    <div class="card">
      <div class="label">Total Due</div>
      <div class="value text-red">${this.formatCurrency(paymentDues.summary.totalDueAmount)}</div>
    </div>
    <div class="card">
      <div class="label">Membership Dues</div>
      <div class="value text-red">${this.formatCurrency(paymentDues.summary.membershipDues)}</div>
    </div>
    <div class="card">
      <div class="label">Salary Dues</div>
      <div class="value text-red">${this.formatCurrency(paymentDues.summary.salaryDues)}</div>
    </div>
    <div class="card">
      <div class="label">Overdue</div>
      <div class="value text-red">${paymentDues.summary.overdueCount}</div>
    </div>
  </div>

  ${paymentDues.membershipDues.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Membership Dues (${paymentDues.membershipDues.length})</h4>
  <table>
    <thead><tr><th>Client</th><th>Plan</th><th style="text-align:right;">Amount</th><th>Due Date</th><th>Status</th></tr></thead>
    <tbody>
      ${paymentDues.membershipDues.map(due => `
        <tr>
          <td><strong>${this.escapeHtml(due.clientName)}</strong><br><span class="text-muted">${this.escapeHtml(due.clientEmail)}</span></td>
          <td><span class="badge badge-purple">${this.escapeHtml(due.planName)}</span></td>
          <td style="text-align:right;" class="text-red">${this.formatCurrency(due.amount)}</td>
          <td>${due.dueDate}</td>
          <td>${due.daysOverdue > 0 ? `<span class="badge badge-red">${due.daysOverdue}d overdue</span>` : '<span class="badge badge-orange">Pending</span>'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : '<p class="text-muted">No pending membership dues.</p>'}

  ${paymentDues.salaryDues.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;margin-top:16px;color:#334155;">Salary Dues (${paymentDues.salaryDues.length})</h4>
  <table>
    <thead><tr><th>Staff</th><th>Role</th><th>Period</th><th style="text-align:right;">Amount</th></tr></thead>
    <tbody>
      ${paymentDues.salaryDues.map(due => `
        <tr>
          <td><strong>${this.escapeHtml(due.staffName)}</strong><br><span class="text-muted">${this.escapeHtml(due.staffEmail)}</span></td>
          <td><span class="badge badge-blue">${this.escapeHtml(due.staffRole)}</span></td>
          <td>${this.escapeHtml(due.period)}</td>
          <td style="text-align:right;" class="text-red">${this.formatCurrency(due.amount)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : '<p class="text-muted">No pending salary dues.</p>'}
</div>

<!-- Attendance Report - Page Break -->
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Attendance Report</div>
  <div class="cards">
    <div class="card">
      <div class="label">Total Check-Ins</div>
      <div class="value">${attendanceReport.summary.totalCheckIns}</div>
    </div>
    <div class="card">
      <div class="label">Avg Daily</div>
      <div class="value">${attendanceReport.summary.avgDailyCheckIns.toFixed(1)}</div>
    </div>
    <div class="card">
      <div class="label">Unique Members</div>
      <div class="value">${attendanceReport.summary.uniqueMembers}</div>
    </div>
    <div class="card">
      <div class="label">Avg Duration</div>
      <div class="value">${attendanceReport.summary.avgDuration} min</div>
    </div>
  </div>

  ${attendanceReport.weeklyPattern.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Weekly Pattern</h4>
  <div class="weekly-grid">
    ${attendanceReport.weeklyPattern.map(day => `
      <div class="weekly-item">
        <div class="day">${day.day.substring(0, 3)}</div>
        <div class="count">${day.count}</div>
      </div>
    `).join('')}
  </div>` : ''}

  ${attendanceReport.genderDistribution ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Gender Distribution</h4>
  <div class="cards" style="margin-bottom:16px;">
    <div class="card"><div class="label">Male</div><div class="value">${attendanceReport.genderDistribution.male}</div></div>
    <div class="card"><div class="label">Female</div><div class="value">${attendanceReport.genderDistribution.female}</div></div>
    <div class="card"><div class="label">Other</div><div class="value">${attendanceReport.genderDistribution.other}</div></div>
  </div>` : ''}

  ${attendanceReport.dailyTrend.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Daily Attendance Trend</h4>
  <table>
    <thead><tr><th>Date</th><th style="text-align:right;">Check-Ins</th></tr></thead>
    <tbody>
      ${attendanceReport.dailyTrend.slice(0, 30).map(day => `
        <tr><td>${day.date}</td><td style="text-align:right;">${day.count}</td></tr>
      `).join('')}
    </tbody>
  </table>` : ''}

  ${attendanceReport.topMembers.length > 0 ? `
  <h4 style="font-size:13px;margin-bottom:8px;color:#334155;">Top Members by Visits</h4>
  <table>
    <thead><tr><th>#</th><th>Member</th><th style="text-align:right;">Visits</th></tr></thead>
    <tbody>
      ${attendanceReport.topMembers.slice(0, 10).map((member, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${this.escapeHtml(member.name)}</td>
          <td style="text-align:right;"><strong>${member.visits}</strong></td>
        </tr>
      `).join('')}
    </tbody>
  </table>` : ''}
</div>

<!-- Trainer/Staff Report -->
${trainerStaffReport.length > 0 ? `
<div class="page-break"></div>
<div class="section">
  <div class="section-title">Trainer & Staff Report</div>
  <table>
    <thead><tr><th>Name</th><th>Role</th><th style="text-align:right;">Assigned Clients</th><th style="text-align:right;">Salary Paid (Year)</th></tr></thead>
    <tbody>
      ${trainerStaffReport.map(staff => `
        <tr>
          <td><strong>${this.escapeHtml(staff.name)}</strong><br><span class="text-muted">${this.escapeHtml(staff.email)}</span></td>
          <td><span class="badge badge-blue">${this.escapeHtml(staff.role)}</span></td>
          <td style="text-align:right;">${staff.clientCount}</td>
          <td style="text-align:right;" class="text-green">${this.formatCurrency(staff.totalSalaryPaid)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</div>` : ''}

<!-- Footer -->
<div class="footer">
  Generated by Strakly &bull; ${new Date(generatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
</div>

</body>
</html>`;
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private escapeHtml(text: string): string {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getMonthName(month: number): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return months[month - 1] || '';
  }
}
