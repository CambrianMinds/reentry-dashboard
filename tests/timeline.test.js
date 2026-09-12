import test from 'node:test';
import assert from 'node:assert';
import {
  computeProsecutorDeadline,
  computeMultiCountyDeadline,
  computeWaitingPeriodAnniversary,
  generateMilestonesForCase,
  generateICS,
  adjustTrialRule6A
} from '../js/timeline.js';

test('Timeline - Trial Rule 6(A) advances weekend deadlines to Monday', () => {
  // 2026-10-03 is a Saturday, 2026-10-04 is a Sunday
  const saturday = new Date('2026-10-03T12:00:00');
  const adjusted = adjustTrialRule6A(saturday);
  assert.strictEqual(adjusted.getDay(), 1, 'Should advance to Monday');
  assert.strictEqual(adjusted.toISOString().split('T')[0], '2026-10-05');
});

test('Timeline - computeProsecutorDeadline calculates 30-day window with rule 6(A)', () => {
  // Filing on 2026-05-01 -> +30 days is 2026-05-31 (Sunday) -> Should advance to 2026-06-01 (Monday)
  const deadline = computeProsecutorDeadline('2026-05-01');
  assert.strictEqual(deadline, '2026-06-01');
});

test('Timeline - computeMultiCountyDeadline calculates exactly 365 days', () => {
  const firstFiling = '2026-01-01';
  const deadline = computeMultiCountyDeadline(firstFiling);
  assert.strictEqual(deadline, '2027-01-01');
});

test('Timeline - computeWaitingPeriodAnniversary applies statutory tiers', () => {
  // Tier 1 (Arrests): 1 year
  assert.strictEqual(computeWaitingPeriodAnniversary('2024-05-10', null, 1), '2025-05-10');
  // Tier 2 (Misdemeanors): 5 years
  assert.strictEqual(computeWaitingPeriodAnniversary('2020-03-15', null, 2), '2025-03-15');
  // Tier 3 (Level 6 Felony): 8 years
  assert.strictEqual(computeWaitingPeriodAnniversary('2018-07-20', null, 3), '2026-07-20');
});

test('Timeline - generateMilestonesForCase produces post-order service reminders when granted', () => {
  const caseObj = {
    id: 'case-123',
    causeNumber: '49D01-1805-F6-000123',
    county: 'Marion',
    status: 'granted',
    grantedDate: '2026-08-01'
  };

  const milestones = generateMilestonesForCase(caseObj);
  const titles = milestones.map((m) => m.title);

  assert.ok(titles.some((t) => t.includes('ISP Records Division')), 'Should generate ISP service step');
  assert.ok(titles.some((t) => t.includes('Indiana BMV')), 'Should generate BMV service step');
  assert.ok(titles.some((t) => t.includes('Local Sheriff / Police')), 'Should generate Sheriff service step');
});

test('Timeline - generateICS creates valid RFC 5545 iCalendar content', () => {
  const events = [
    {
      id: 'ev-1',
      title: 'Prosecutor 30-Day Objection Deadline',
      date: '2026-10-05',
      notes: 'IC § 35-38-9 and Trial Rule 6(A)'
    }
  ];

  const ics = generateICS(events);
  assert.ok(ics.includes('BEGIN:VCALENDAR'), 'Contains VCALENDAR header');
  assert.ok(ics.includes('BEGIN:VEVENT'), 'Contains VEVENT block');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261005'), 'Contains formatted date');
  assert.ok(ics.includes('SUMMARY:Prosecutor 30-Day Objection Deadline'), 'Contains summary');
  assert.ok(ics.includes('END:VCALENDAR'), 'Contains VCALENDAR footer');
});
