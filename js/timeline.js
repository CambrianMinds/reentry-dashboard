/**
 * Indiana Statutory Timeline & Deadlines Engine
 * Computes critical Indiana Code § 35-38-9 statutory milestones and Indiana Trial Rule 6(A) court deadlines.
 */

// Indiana State Legal Holidays (Fixed & Floating Rules)
function isIndianaCourtHoliday(date) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();
  const dayOfWeek = date.getDay(); // 0 = Sun, 6 = Sat

  // Fixed holidays
  if (month === 0 && day === 1) return true; // New Year's Day
  if (month === 5 && day === 19) return true; // Juneteenth
  if (month === 6 && day === 4) return true; // Independence Day
  if (month === 10 && day === 11) return true; // Veterans Day
  if (month === 11 && day === 25) return true; // Christmas Day

  // Floating holidays
  // MLK Day: 3rd Monday in January
  if (month === 0 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  // Presidents Day: 3rd Monday in February
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;
  // Memorial Day: Last Monday in May
  if (month === 4 && dayOfWeek === 1 && day >= 25) return true;
  // Labor Day: 1st Monday in September
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;
  // Thanksgiving: 4th Thursday in November
  if (month === 10 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;
  // Day after Thanksgiving: Friday after 4th Thursday
  if (month === 10 && dayOfWeek === 5 && day >= 23 && day <= 29) return true;

  return false;
}

/**
 * Adjust a date under Indiana Trial Rule 6(A).
 * If the computed deadline lands on a weekend or court holiday, it advances to the next judicial business day.
 */
export function adjustTrialRule6A(targetDate) {
  const result = new Date(targetDate);
  while (result.getDay() === 0 || result.getDay() === 6 || isIndianaCourtHoliday(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

/**
 * Calculate 30-day prosecutor objection window
 * Filing Date + 30 calendar days, adjusted for weekends and court holidays.
 */
export function computeProsecutorDeadline(filingDateStr) {
  if (!filingDateStr) return null;
  const filing = new Date(filingDateStr + 'T12:00:00');
  if (isNaN(filing.getTime())) return null;

  const deadline = new Date(filing);
  deadline.setDate(deadline.getDate() + 30);
  const adjusted = adjustTrialRule6A(deadline);

  return adjusted.toISOString().split('T')[0];
}

/**
 * Calculate the 365-day multi-county window deadline under IC § 35-38-9-9(h)
 * When convictions span multiple counties, all petitions must be filed within 365 days of the first petition.
 */
export function computeMultiCountyDeadline(firstFilingDateStr) {
  if (!firstFilingDateStr) return null;
  const first = new Date(firstFilingDateStr + 'T12:00:00');
  if (isNaN(first.getTime())) return null;

  const windowEnd = new Date(first);
  windowEnd.setDate(windowEnd.getDate() + 365);
  return windowEnd.toISOString().split('T')[0];
}

/**
 * Compute statutory waiting period conclusion date based on offense tier
 * - Section 1 (Arrests/Dismissals): 1 year
 * - Section 2 (Misdemeanors): 5 years
 * - Section 3 (Class D / Level 6 Felonies): 8 years
 * - Section 4 (Major Felonies without injury): 8 years from conviction or 3 years from sentence completion
 * - Section 5 (Elected official / serious bodily injury): 10 years + prosecutor consent
 */
export function computeWaitingPeriodAnniversary(dispositionDateStr, sentenceCompletionDateStr, offenseTier = 2) {
  const baseStr = sentenceCompletionDateStr || dispositionDateStr;
  if (!baseStr) return null;

  const base = new Date(baseStr + 'T12:00:00');
  if (isNaN(base.getTime())) return null;

  const anniversary = new Date(base);
  let yearsToAdd = 5;

  switch (Number(offenseTier)) {
    case 1:
      yearsToAdd = 1;
      break;
    case 2:
      yearsToAdd = 5;
      break;
    case 3:
      yearsToAdd = 8;
      break;
    case 4:
      yearsToAdd = 8;
      break;
    case 5:
      yearsToAdd = 10;
      break;
    default:
      yearsToAdd = 5;
  }

  anniversary.setFullYear(anniversary.getFullYear() + yearsToAdd);
  return anniversary.toISOString().split('T')[0];
}

/**
 * Generate all statutory milestones for a given case
 */
export function generateMilestonesForCase(caseObj, allCases = []) {
  const milestones = [];
  const caseId = caseObj.id;
  const cause = caseObj.causeNumber || 'Case';
  const county = caseObj.county ? ` (${caseObj.county})` : '';

  // 1. If currently petitioned:
  if (caseObj.status === 'petitioned' && caseObj.dispositionDate) {
    // Check if user set filingDate or using updatedAt
    const filingDate = caseObj.filingDate || (caseObj.updatedAt ? caseObj.updatedAt.split('T')[0] : null);
    if (filingDate) {
      const prosDeadline = computeProsecutorDeadline(filingDate);
      if (prosDeadline) {
        milestones.push({
          caseId,
          title: `Prosecutor Response Deadline — ${cause}${county}`,
          date: prosDeadline,
          type: 'statutory',
          completed: false,
          notes: 'IC § 35-38-9: Prosecutor has 30 days to object or consent (Trial Rule 6(A) adjusted). If no objection is filed, court may grant without hearing.'
        });
      }
    }
  }

  // 2. Multi-County 365-Day Window Check
  const petitionedCases = allCases.filter((c) => c.status === 'petitioned' || c.status === 'granted');
  const distinctCounties = new Set(allCases.map((c) => c.county).filter(Boolean));

  if (distinctCounties.size > 1 && petitionedCases.length > 0) {
    // Find the earliest petition/filing date
    const dates = petitionedCases
      .map((c) => c.filingDate || (c.updatedAt ? c.updatedAt.split('T')[0] : null))
      .filter(Boolean)
      .sort();

    if (dates.length > 0) {
      const windowEnd = computeMultiCountyDeadline(dates[0]);
      if (windowEnd) {
        milestones.push({
          caseId: null, // applies globally
          title: '365-Day Multi-County Filing Clock Expires',
          date: windowEnd,
          type: 'statutory',
          completed: false,
          notes: 'IC § 35-38-9-9(h): Lifetime rule. Petitions in all other Indiana counties must be filed within 365 days of your first filing date.'
        });
      }
    }
  }

  // 3. If Granted: Post-Order Service Checklists
  if (caseObj.status === 'granted') {
    const grantedDate = caseObj.grantedDate || (caseObj.updatedAt ? caseObj.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0]);
    const serviceDate = new Date(grantedDate + 'T12:00:00');
    serviceDate.setDate(serviceDate.getDate() + 14);
    const deadlineStr = serviceDate.toISOString().split('T')[0];

    milestones.push({
      caseId,
      title: `Serve Certified Order: ISP Records Division — ${cause}`,
      date: deadlineStr,
      type: 'service',
      completed: false,
      notes: 'Send certified copy of granted expungement order to Indiana State Police Criminal History Records Division (100 N Senate Ave N302, Indianapolis, IN 46204).'
    });

    milestones.push({
      caseId,
      title: `Serve Certified Order: Indiana BMV — ${cause}`,
      date: deadlineStr,
      type: 'service',
      completed: false,
      notes: 'Send certified copy of granted order to Indiana Bureau of Motor Vehicles Legal Dept (100 N Senate Ave N404, Indianapolis, IN 46204).'
    });

    milestones.push({
      caseId,
      title: `Serve Certified Order: Local Sheriff / Police — ${cause}`,
      date: deadlineStr,
      type: 'service',
      completed: false,
      notes: 'Deliver or mail certified copy of granted order to the arresting law enforcement agency in ' + (caseObj.county || 'the local county') + '.'
    });
  }

  // 4. Waiting Period Milestone (for imported/in-progress cases)
  if (caseObj.status === 'imported' && (caseObj.dispositionDate || caseObj.sentenceCompletedDate)) {
    const anni = computeWaitingPeriodAnniversary(
      caseObj.dispositionDate,
      caseObj.sentenceCompletedDate,
      caseObj.offenseTier
    );
    if (anni) {
      const today = new Date().toISOString().split('T')[0];
      if (anni > today) {
        milestones.push({
          caseId,
          title: `Statutory Waiting Period Matures — ${cause}`,
          date: anni,
          type: 'reminder',
          completed: false,
          notes: `Based on IC § 35-38-9 Tier ${caseObj.offenseTier}, the statutory waiting period completes on this date.`
        });
      }
    }
  }

  return milestones;
}

// -------------------------------------------------------------
// RFC 5545 iCALENDAR (.ics) EXPORTER
// -------------------------------------------------------------

function formatDateToICS(dateStr) {
  // YYYYMMDD
  return dateStr.replace(/-/g, '');
}

/**
 * Generate iCalendar RFC 5545 string from a list of events
 */
export function generateICS(events = []) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Indiana Re-Entry Vault//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Indiana Expungement Deadlines'
  ];

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  for (const ev of events) {
    const dt = formatDateToICS(ev.date);
    const uid = (ev.id || 'ev-' + Math.random().toString(36).substr(2, 9)) + '@reentry.indiana';
    const summary = (ev.title || 'Expungement Deadline').replace(/[,\n;]/g, ' ');
    const desc = (ev.notes || '').replace(/\n/g, '\\n').replace(/[;,]/g, ' ');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`DTEND;VALUE=DATE:${dt}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`DESCRIPTION:${desc}`);
    lines.push('STATUS:CONFIRMED');
    lines.push('TRANSP:TRANSPARENT');

    // Add reminder alarm (9:00 AM day of deadline)
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT9H');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:Reminder: ${summary}`);
    lines.push('END:VALARM');

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Trigger client-side download of the .ics calendar file
 */
export function downloadCalendarICS(events = []) {
  const icsText = generateICS(events);
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Indiana_Expungement_Deadlines_${new Date().toISOString().split('T')[0]}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
