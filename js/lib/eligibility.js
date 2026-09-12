/**
 * Indiana Expungement Assistant - Statutory Eligibility Rules Engine
 * Implements IC § 35-38-9 (Indiana Second Chance Law)
 * 
 * This module runs 100% in-browser as part of the content script.
 * No external network calls - all classification is local.
 */

const IndianaExpungement = (() => {

  // ─── Indiana Case Type Code Mappings ─────────────────────────────────
  const CASE_TYPE_MAP = {
    // Felonies
    'FA': { level: 'felony', class: 'A', severity: 6 },
    'FB': { level: 'felony', class: 'B', severity: 5 },
    'FC': { level: 'felony', class: 'C', severity: 4 },
    'FD': { level: 'felony', class: 'D', severity: 3 },
    'F1': { level: 'felony', class: '1', severity: 6 },
    'F2': { level: 'felony', class: '2', severity: 5 },
    'F3': { level: 'felony', class: '3', severity: 4 },
    'F4': { level: 'felony', class: '4', severity: 3 },
    'F5': { level: 'felony', class: '5', severity: 2 },
    'F6': { level: 'felony', class: '6', severity: 1 },
    'DF': { level: 'felony', class: 'D', severity: 3 },  // Legacy alias
    'MR': { level: 'felony', class: 'Murder', severity: 7, barred: true }, // Murder (IC § 35-42-1-1) - Statutorily barred
    // Misdemeanors
    'CM': { level: 'misdemeanor', class: 'A/B/C', severity: 0 },
    'MA': { level: 'misdemeanor', class: 'A', severity: 0 },
    'MB': { level: 'misdemeanor', class: 'B', severity: 0 },
    'MC': { level: 'miscellaneous_criminal', class: null, severity: -1 },
    // Infractions
    'IF': { level: 'infraction', class: null, severity: -2 },
    'IFC': { level: 'infraction', class: 'C', severity: -2 },
    // Non-criminal (excluded from expungement)
    'SC': { level: 'civil', class: null, severity: -10 },
    'CC': { level: 'civil', class: null, severity: -10 },
    'CT': { level: 'civil', class: null, severity: -10 },
    'PL': { level: 'civil', class: null, severity: -10 },
    'MF': { level: 'civil', class: null, severity: -10 },
    'DR': { level: 'domestic', class: null, severity: -10 },
    'GU': { level: 'guardianship', class: null, severity: -10 },
    'JC': { level: 'juvenile', class: null, severity: -10 },
    'JD': { level: 'juvenile', class: null, severity: -10 },
    'JS': { level: 'juvenile', class: null, severity: -10 },
    'JM': { level: 'juvenile', class: null, severity: -10 },
    'JP': { level: 'juvenile', class: null, severity: -10 },
    'JT': { level: 'juvenile', class: null, severity: -10 },
    'AD': { level: 'adoption', class: null, severity: -10 },
    'ES': { level: 'estate', class: null, severity: -10 },
    'EU': { level: 'estate', class: null, severity: -10 },
    'PO': { level: 'protective_order', class: null, severity: -10 },
    'CP': { level: 'civil_plenary', class: null, severity: -10 },
    'MI': { level: 'civil', class: null, severity: -10 },
    'XP': { level: 'expungement', class: null, severity: -10 },
    'TR': { level: 'civil', class: null, severity: -10 },
    'OV': { level: 'civil', class: null, severity: -10 },
    'EV': { level: 'civil', class: null, severity: -10 }, // Evictions
  };

  // Offenses that are NOT eligible for expungement under any section (IC § 35-38-9)
  const INELIGIBILITY_RULES = [
    {
      keywords: ['MURDER', 'VOLUNTARY MANSLAUGHTER', 'INVOLUNTARY MANSLAUGHTER', 'RECKLESS HOMICIDE', 'HUMAN TRAFFICKING', 'CHILD MOLESTING', 'CHILD EXPLOITATION', 'CHILD SOLICITATION', 'RAPE', 'CRIMINAL DEVIATE CONDUCT', 'CHILD SEDUCTION', 'SEXUAL MISCONDUCT WITH A MINOR', 'INCEST', 'SEX OFFENDER REGISTRY', 'OFFICIAL MISCONDUCT'],
      rule: 'IC § 35-38-9-3(b)',
      reason: 'Statutorily Barred Offense (Sex Offenses, Murder, Official Misconduct)',
      description: 'The Indiana Code permanently bars this specific offense from expungement.',
      mitigationType: 'strictly_excluded',
      mitigationSteps: 'This offense cannot be expunged under any circumstances. A pardon from the Governor of Indiana is the only theoretical avenue for relief.'
    },
    {
      keywords: ['CAUSING DEATH WHEN OPERATING', 'RESULTING IN DEATH', 'DOMESTIC BATTERY RESULTING IN SERIOUS BODILY INJURY', 'AGGRAVATED BATTERY', 'ATTEMPTED MURDER', 'SERIOUS VIOLENT FELONY'],
      rule: 'IC § 35-38-9-5 / IC § 35-38-9-4(b)',
      reason: 'Serious Violent Felony or Offense Resulting in Death/Serious Injury',
      description: 'Under IC § 35-38-9-5, offenses causing death or classified as Serious Violent Felonies require prosecutorial consent.',
      mitigationType: 'consent_required',
      mitigationSteps: 'You may petition to expunge this offense ONLY IF you obtain written consent from the prosecuting attorney. You must contact the prosecutor\'s office before filing to negotiate consent.'
    },
    {
      keywords: ['PERJURY', 'OBSTRUCTION OF JUSTICE'],
      rule: 'IC § 35-38-9-3(b)(2)',
      reason: 'Public Trust Offense (Perjury / Obstruction)',
      description: 'Certain offenses against public justice are explicitly barred from standard expungement.',
      mitigationType: 'strictly_excluded',
      mitigationSteps: 'This offense is barred from expungement by statute.'
    }
  ];

  // Offenses that suggest bodily injury (affects § 3 eligibility: court discretion under § 3(b))
  const BODILY_INJURY_INDICATORS = [
    'BODILY INJURY',
    'BATTERY RESULTING IN BODILY INJURY',
    'DOMESTIC BATTERY',
    'CAUSING SERIOUS BODILY INJURY',
    'RESULTING IN DEATH',
    'AGGRAVATED BATTERY',
    'ATTEMPTED MURDER'
  ];

  // ─── Core Eligibility Functions ──────────────────────────────────────

  /**
   * Extract the 2-letter case type code from a case number or case type string.
   */
  function extractCaseTypeCode(caseNumberOrType) {
    if (!caseNumberOrType) return null;
    const str = caseNumberOrType.trim().toUpperCase();

    // Catch Superior (D), Circuit (C), City (H), Town (I), or Probate/Criminal (G) courts
    // Supports standard, legacy, and spaced formats
    const caseNumMatch = str.match(/^\d+[A-Z]\d*\s*[-–—]\s*\d{4}\s*[-–—]\s*([A-Z0-9]{2,3})\s*[-–—]/i);
    if (caseNumMatch) return caseNumMatch[1].toUpperCase();

    const labelMatch = str.match(/^([A-Z0-9]{2,3})\s*[-–—]/);
    if (labelMatch) return labelMatch[1].toUpperCase();

    const bareMatch = str.match(/^([A-Z0-9]{2,3})$/);
    if (bareMatch) return bareMatch[1].toUpperCase();

    return null;
  }

  /**
   * Extract the county court code from a case number.
   */
  function extractCourtCode(caseNumber) {
    if (!caseNumber) return null;
    const match = caseNumber.trim().match(/^(\d+[A-Z]\d*)/i);
    return match ? match[1].toUpperCase() : null;
  }

  /**
   * Extract the county FIPS code from a court code.
   * Ensures two-digit zero-padded string ('01' to '92') matching INDIANA_COUNTIES.
   */
  function extractCountyCode(courtCode) {
    if (!courtCode) return null;
    const match = courtCode.match(/^(\d+)/);
    return match ? String(match[1]).padStart(2, '0') : null;
  }

  /**
   * Parse a date string, timestamp, or Date object into a valid Date object.
   * Tolerates:
   * - MM/DD/YYYY (with or without timestamps, e.g. "05/10/2018 11:30:00 AM")
   * - YYYY-MM-DD (e.g. "2018-05-10" or "2018-05-10T14:30:00.000Z")
   * - Odyssey / ASP.NET serialized dates: "/Date(1525924800000)/" or "/Date(1525924800000-0500)/"
   * - Epoch millisecond numbers or numeric strings
   * - Textual dates: "May 10, 2018", "10-MAY-2018", "10 May 2018"
   * Avoids timezone conversion shifts for calendar dates.
   */
  function parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) {
      return isNaN(dateStr.getTime()) ? null : dateStr;
    }
    if (typeof dateStr === 'number') {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    }

    const str = String(dateStr).trim();
    if (!str) return null;

    // 1. ASP.NET / Odyssey WCF serialized JSON date: /Date(1525924800000)/ or /Date(1525924800000-0500)/
    const aspMatch = str.match(/\/Date\((\d+)(?:[+-]\d+)?\)\//);
    if (aspMatch) {
      const d = new Date(parseInt(aspMatch[1], 10));
      return isNaN(d.getTime()) ? null : d;
    }

    // 2. Pure epoch millisecond or second string
    if (/^\d{10,13}$/.test(str)) {
      const num = parseInt(str, 10);
      const ms = str.length === 10 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    // 3. MM/DD/YYYY (optionally followed by time/timestamp)
    let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      return new Date(parseInt(match[3], 10), parseInt(match[1], 10) - 1, parseInt(match[2], 10));
    }

    // 4. YYYY-MM-DD (calendar date without timezone shift)
    match = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (match) {
      return new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10));
    }

    // 5. DD-MMM-YYYY or DD MMM YYYY (e.g. "10-MAY-2018" or "10 May 2018")
    const monthNames = {
      JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
      JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
    };
    match = str.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})/);
    if (match) {
      const mStr = match[2].substr(0, 3).toUpperCase();
      if (monthNames[mStr] !== undefined) {
        return new Date(parseInt(match[3], 10), monthNames[mStr], parseInt(match[1], 10));
      }
    }

    // 6. MMM DD, YYYY (e.g. "May 10, 2018")
    match = str.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/);
    if (match) {
      const mStr = match[1].substr(0, 3).toUpperCase();
      if (monthNames[mStr] !== undefined) {
        return new Date(parseInt(match[3], 10), monthNames[mStr], parseInt(match[2], 10));
      }
    }

    // 7. Standard Date constructor fallback
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Extract disposition date from a status string.
   * Tolerates MM/DD/YYYY, YYYY-MM-DD, or Month DD, YYYY patterns.
   */
  function extractDispositionDate(statusStr) {
    if (!statusStr) return null;
    const str = String(statusStr).trim();

    // Try MM/DD/YYYY
    const mdy = str.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (mdy) return parseDate(mdy[1]);

    // Try YYYY-MM-DD
    const ymd = str.match(/(\d{4}-\d{2}-\d{2})/);
    if (ymd) return parseDate(ymd[1]);

    // Try Month DD, YYYY
    const textDate = str.match(/([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/);
    if (textDate) return parseDate(textDate[1]);

    return parseDate(str);
  }

  /**
   * Calculate the number of full years elapsed between a date and today.
   */
  function yearsElapsed(fromDate, asOf = new Date()) {
    if (!fromDate) return 0;
    let years = asOf.getFullYear() - fromDate.getFullYear();
    const monthDiff = asOf.getMonth() - fromDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < fromDate.getDate())) {
      years--;
    }
    return Math.max(0, years);
  }

  /**
   * Check if a case or charge description falls under an ineligibility rule (IC § 35-38-9).
   */
  function checkIneligibility(charges, caseData = {}) {
    const cNum = caseData.case_number || caseData.caseNumber || '';
    const typeCode = extractCaseTypeCode(caseData.case_type || cNum);
    
    // Automatic statutory bar for Murder (MR)
    if (typeCode === 'MR' || /-MR-/i.test(cNum)) {
      return {
        keywords: ['MR', 'MURDER'],
        rule: 'IC § 35-38-9-3(b)',
        reason: 'Statutorily Barred: Murder (MR / IC § 35-42-1-1)',
        description: 'Under IC § 35-38-9-3(b) and § 8(b), Indiana law strictly bars any offense resulting in death or homicide from expungement.',
        mitigationType: 'strictly_excluded',
        mitigationSteps: 'This offense cannot be expunged under Indiana law. A gubernatorial pardon is the only potential legal avenue.'
      };
    }

    const textToScan = `${charges || ''} ${caseData.title || ''}`.toUpperCase();
    if (!textToScan.trim()) return null;

    for (const rule of INELIGIBILITY_RULES) {
      if (rule.keywords.some(keyword => textToScan.includes(keyword))) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if a charge description involves bodily injury.
   */
  function involveBodilyInjury(charges) {
    if (!charges) return false;
    const upper = charges.toUpperCase();
    return BODILY_INJURY_INDICATORS.some(indicator => upper.includes(indicator));
  }

  /**
   * Determines if a case resulted in a criminal conviction.
   * Checks CCS docket entries for explicit sentencing (S/DET) or dismissals (ODIS).
   */
  function determineConvictionStatus(caseData, typeInfo) {
    if (!typeInfo || ['civil', 'domestic', 'guardianship', 'juvenile', 'adoption', 'estate', 'protective_order', 'civil_plenary', 'expungement', 'infraction'].includes(typeInfo.level)) {
      return false;
    }

    let isConviction = true; // Default assumption for criminal cases

    if (caseData.ccs) {
      const hasSentencing = caseData.ccs.docketEntries?.some(e => e.type === 'S' || e.type === 'DET');
      const hasDismissal = caseData.ccs.docketEntries?.some(e => e.type === 'ODIS' && (e.description || '').toUpperCase().includes('DISMISS'));
      const allChargesDismissed = caseData.ccs.charges?.every(ch => ch.disposition && (ch.disposition.toUpperCase().includes('DISMISS') || ch.disposition.toUpperCase().includes('CONDITIONAL DISCHARGE')));

      if (hasSentencing) {
        isConviction = true; // Revoked discharge or standard sentencing
      } else if (allChargesDismissed || hasDismissal) {
        isConviction = false; // Successfully discharged or dismissed
      }
    }
    return isConviction;
  }

  /**
   * Validates a single case record before processing.
   * Identifies malformed cause numbers, missing dates, unsupported case types,
   * and chronological anomalies.
   *
   * @param {Object} caseData - The case data record to validate
   * @returns {{ isValid: boolean, errors: string[], warnings: string[], normalized: Object }}
   */
  function validateCaseRecord(caseData) {
    const errors = [];
    const warnings = [];

    if (!caseData || typeof caseData !== 'object') {
      return {
        isValid: false,
        errors: ['Case record is missing or invalid object.'],
        warnings: [],
        normalized: null
      };
    }

    const caseNum = (caseData.case_number || caseData.caseNumber || '').trim();
    if (!caseNum) {
      errors.push('Missing case number / cause number.');
    } else {
      // Indiana case number format: XX(C|D|H|I|G)XX-YYYY-CC-NNNNNN
      const isIndPattern = /^\d{1,2}[A-Za-z]\d{1,2}\s*[-–—]\s*\d{4}\s*[-–—]\s*[A-Za-z0-9]{2,3}\s*[-–—]\s*\d{3,7}$/i.test(caseNum);
      if (!isIndPattern) {
        warnings.push(`Cause number "${caseNum}" does not match standard Indiana Trial Rule 77 format (XXDXX-YYYY-CC-NNNNNN).`);
      }
    }

    const typeCode = extractCaseTypeCode(caseData.case_type || caseNum);
    if (!typeCode) {
      warnings.push('Unable to determine Indiana case type code from case number or description.');
    } else if (!CASE_TYPE_MAP[typeCode]) {
      warnings.push(`Case type code "${typeCode}" is not recognized in standard Indiana court taxonomy.`);
    }

    const courtCode = extractCourtCode(caseNum);
    const countyCode = courtCode ? extractCountyCode(courtCode) : null;
    if (countyCode && !INDIANA_COUNTIES[countyCode]) {
      warnings.push(`County FIPS code "${countyCode}" is not recognized in Indiana (01-92).`);
    }

    const filedDate = parseDate(caseData.filed);
    const rawDisp = caseData.dispositionDate || caseData.ccs?.dispositionDate || extractDispositionDate(caseData.status);
    const dispDate = parseDate(rawDisp);

    if (caseData.filed && !filedDate) {
      warnings.push(`Filed date "${caseData.filed}" could not be parsed.`);
    }

    if (rawDisp && !dispDate) {
      warnings.push(`Disposition date "${rawDisp}" could not be parsed.`);
    }

    if (filedDate && dispDate && dispDate < filedDate) {
      warnings.push(`Chronological anomaly: Disposition date (${dispDate.toLocaleDateString()}) is earlier than filed date (${filedDate.toLocaleDateString()}).`);
    }

    const typeInfo = typeCode ? CASE_TYPE_MAP[typeCode] : null;
    const isCriminal = typeInfo && ['misdemeanor', 'felony'].includes(typeInfo.level);
    if (isCriminal && !dispDate && !caseData.status?.toUpperCase().includes('PENDING')) {
      warnings.push('Criminal case lacks a verified disposition date. Eligibility calculations require verification of final judgment date.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalized: {
        caseNumber: caseNum,
        typeCode,
        courtCode,
        countyCode,
        countyName: countyCode ? getCountyName(countyCode) : null,
        filedDate,
        dispositionDate: dispDate,
        typeInfo
      }
    };
  }

  /**
   * Determine the applicable IC § 35-38-9 section for a given case.
   */
  function assessEligibility(caseData, asOf = new Date(), mostRecentConvictionDate = null) {
    const typeCode = extractCaseTypeCode(caseData.case_type || caseData.caseNumber);
    const typeInfo = CASE_TYPE_MAP[typeCode] || null;

    // Check direct disposition date, CCS disposition, status regex, and filed date fallback
    const rawDisp = caseData.dispositionDate || caseData.ccs?.dispositionDate || extractDispositionDate(caseData.status) || caseData.filed;
    const dispositionDate = parseDate(rawDisp);
    const elapsed = yearsElapsed(dispositionDate, asOf);
    const statusUpper = (caseData.status || '').toUpperCase();
    const isPending = statusUpper.includes('PENDING');
    const isDecided = statusUpper.includes('DECIDED') || statusUpper.includes('CLOSED') || statusUpper.includes('DISPOSED');
    const charges = caseData.charges || '';

    // Calculate clean period across all cases
    const isConviction = determineConvictionStatus(caseData, typeInfo);
    const cleanPeriodYears = mostRecentConvictionDate ? yearsElapsed(mostRecentConvictionDate, asOf) : Infinity;

    const result = {
      caseNumber: caseData.case_number || caseData.caseNumber,
      typeCode,
      typeInfo,
      dispositionDate,
      yearsElapsed: elapsed,
      isPending,
      charges,
      eligible: false,
      statute: null,
      statuteLabel: null,
      statuteUrl: 'https://iga.in.gov/laws/2024/ic/titles/35#35-38-9',
      waitingPeriod: null,
      waitingPeriodMet: false,
      eligibilityDate: null,
      reason: '',
      warnings: [],
      validationErrors: [],
      dateParseFailed: false,
      filingFee: null,
      grantType: null
    };

    // Detect unparseable or missing disposition dates on criminal records
    const isCriminal = typeInfo && ['infraction', 'misdemeanor', 'felony', 'miscellaneous_criminal'].includes(typeInfo.level);
    if (!dispositionDate && isCriminal) {
      result.dateParseFailed = true;
      result.validationErrors.push('Missing or unparseable disposition date');
      result.warnings.push('Court record lacks a verifiable disposition or sentencing date. Manual verification is required before filing.');
    }

    // ── Exclude non-criminal cases ──
    if (typeInfo && ['civil', 'domestic', 'guardianship', 'juvenile', 'adoption',
      'estate', 'protective_order', 'civil_plenary', 'expungement'].includes(typeInfo.level)) {
      result.reason = `Excluded: ${typeInfo.level} case (not a criminal record)`;
      result.statute = 'N/A';
      result.statuteLabel = 'Not applicable (non-criminal)';
      return result;
    }

    // ── Check for ineligible offenses ──
    const ineligibilityRule = checkIneligibility(charges, caseData);
    if (ineligibilityRule) {
      result.reason = `INELIGIBLE: ${ineligibilityRule.reason}`;
      result.statute = ineligibilityRule.rule;
      result.statuteLabel = 'Excluded Offense';
      result.exclusionReason = ineligibilityRule.description;
      result.mitigationType = ineligibilityRule.mitigationType;
      result.mitigationSteps = ineligibilityRule.mitigationSteps;
      result.isStatutorilyBarred = true;
      result.barredCategory = ineligibilityRule.reason;

      if (ineligibilityRule.mitigationType === 'consent_required') {
        result.warnings.push('Prosecutor consent is REQUIRED to expunge this offense.');
      } else {
        result.warnings.push(`Statutory Bar: Offense is permanently excluded from expungement under ${ineligibilityRule.rule}.`);
      }
      return result;
    }

    // ── Pending case status check ──
    const isActivelyPending = isPending && !isDecided;
    if (isPending) {
      result.warnings.push('Case status indicates PENDING - verify current disposition before filing. Pending charges statutorily block expungement.');
    }

    // ── Route by case type ──

    // IC § 35-38-9-1: Arrests, non-convictions, infractions
    if (typeInfo && (typeInfo.level === 'infraction' || typeInfo.level === 'miscellaneous_criminal' || !isConviction)) {
      if (typeInfo.level === 'miscellaneous_criminal') {
        result.warnings.push('MC (Miscellaneous Criminal) cases may involve misdemeanor convictions. Verify the final disposition.');
      }
      result.statute = 'IC § 35-38-9-1';
      result.statuteLabel = 'Arrest/Infraction Expungement (§ 1)';
      result.statuteUrl = 'https://iga.in.gov/laws/2024/ic/titles/35#35-38-9-1';
      result.waitingPeriod = 1;
      result.waitingPeriodMet = elapsed >= 1;
      if (dispositionDate) {
        result.eligibilityDate = new Date(dispositionDate);
        result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
      }
      result.filingFee = 0;
      result.grantType = 'mandatory';

      if (isActivelyPending) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'INELIGIBLE: Case status is PENDING or OPEN. Under IC § 35-38-9-1(b)(3), no charges may be pending against the petitioner.';
        result.warnings.push('Active pending charges cannot be expunged until final dismissal, acquittal, or disposition.');
        return result;
      }

      if (result.dateParseFailed) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'MANUAL REVIEW REQUIRED: Unable to verify disposition date from court record. Please verify case disposition date.';
        return result;
      }

      result.eligible = result.waitingPeriodMet;
      result.reason = result.eligible
        ? `ELIGIBLE: ${elapsed} years elapsed (≥1 year required). No filing fee. Mandatory grant.`
        : `NOT YET ELIGIBLE: Only ${elapsed} year(s) elapsed. Must wait at least 1 year from disposition.`;
      return result;
    }

    // IC § 35-38-9-2: Misdemeanor convictions
    if (typeInfo && typeInfo.level === 'misdemeanor' && isConviction) {
      result.statute = 'IC § 35-38-9-2';
      result.statuteLabel = 'Misdemeanor Expungement (§ 2)';
      result.statuteUrl = 'https://iga.in.gov/laws/2024/ic/titles/35#35-38-9-2';
      result.waitingPeriod = 5;
      result.waitingPeriodMet = elapsed >= 5;
      if (dispositionDate) {
        result.eligibilityDate = new Date(dispositionDate);
        result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
      }
      result.filingFee = 157;
      result.grantType = 'mandatory';

      if (isActivelyPending) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'INELIGIBLE: Case status is PENDING or OPEN. Under IC § 35-38-9-2(d)(3), no criminal charges may be pending.';
        result.warnings.push('Active pending charges cannot be expunged until final judgment or disposition.');
        return result;
      }

      if (result.dateParseFailed) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'MANUAL REVIEW REQUIRED: Unable to verify conviction date from court record. Please check case status and judgment date before filing.';
        return result;
      }

      // Enforce the 5-year clean period (new conviction within 5 years resets the clock)
      result.eligible = result.waitingPeriodMet && (cleanPeriodYears >= 5);

      if (result.waitingPeriodMet && cleanPeriodYears < 5) {
        result.cleanPeriodBroken = true;
        result.cleanPeriodYears = cleanPeriodYears;
        if (mostRecentConvictionDate) {
          result.eligibilityDate = new Date(mostRecentConvictionDate);
          result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
        }
        result.reason = `INELIGIBLE: Clean period broken. You have a subsequent conviction within the last 5 years (IC § 35-38-9-2(d)(2)). Waiting period resets from date of newest conviction.`;
        result.warnings.push(`Clean period broken: Conviction on ${mostRecentConvictionDate ? mostRecentConvictionDate.toLocaleDateString() : 'recent date'} resets your 5-year clean waiting clock.`);
      } else {
        result.reason = result.eligible
          ? `ELIGIBLE: ${elapsed} years elapsed (≥5 years required). Filing fee ~$157. Mandatory grant.`
          : `NOT YET ELIGIBLE: Only ${elapsed} year(s) elapsed. Must wait at least 5 years from conviction.`;
      }

      return result;
    }

    // IC § 35-38-9-3 & 4: Felony convictions
    if (typeInfo && typeInfo.level === 'felony' && isConviction) {
      if (isActivelyPending) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'INELIGIBLE: Case status is PENDING or OPEN. Under IC § 35-38-9, no criminal charges may be pending.';
        result.warnings.push('Active pending charges cannot be expunged until final judgment or disposition.');
        return result;
      }

      if (result.dateParseFailed) {
        result.eligible = false;
        result.waitingPeriodMet = false;
        result.reason = 'MANUAL REVIEW REQUIRED: Unable to verify conviction date from court record. Please check case status and judgment date before filing.';
        return result;
      }

      // §3 applies to Class D / Level 6 felonies (severity ≤ 3)
      if (typeInfo.severity <= 3) {
        result.statute = 'IC § 35-38-9-3';
        result.statuteLabel = 'Felony Expungement (§ 3)';
        result.statuteUrl = 'https://iga.in.gov/laws/2024/ic/titles/35#35-38-9-3';
        result.waitingPeriod = 8;
        result.waitingPeriodMet = elapsed >= 8;
        if (dispositionDate) {
          result.eligibilityDate = new Date(dispositionDate);
          result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
        }
        result.filingFee = 157;
        result.grantType = 'mandatory';

        if (involveBodilyInjury(charges)) {
          result.grantType = 'discretionary';
          result.warnings.push('Charge may involve bodily injury — court has discretion under § 3(b).');
        }

        // Enforce the 8-year clean period
        result.eligible = result.waitingPeriodMet && (cleanPeriodYears >= 8);

        if (result.waitingPeriodMet && cleanPeriodYears < 8) {
          result.cleanPeriodBroken = true;
          result.cleanPeriodYears = cleanPeriodYears;
          if (mostRecentConvictionDate) {
            result.eligibilityDate = new Date(mostRecentConvictionDate);
            result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
          }
          result.reason = `INELIGIBLE: Clean period broken. You have a subsequent conviction within the last 8 years (IC § 35-38-9-3(d)(2)). Waiting period resets from date of newest conviction.`;
          result.warnings.push(`Clean period broken: Subsequent conviction resets your 8-year clean waiting clock.`);
        } else {
          result.reason = result.eligible
            ? `ELIGIBLE: ${elapsed} years elapsed. ${result.grantType === 'mandatory' ? 'Mandatory' : 'Discretionary'} grant.`
            : `NOT YET ELIGIBLE: Only ${elapsed} year(s) elapsed. Must wait at least 8 years.`;
        }
        return result;
      }

      // §4 applies to higher-level felonies (Class A/B/C or Level 1-5) — discretionary
      result.statute = 'IC § 35-38-9-4';
      result.statuteLabel = 'Higher Felony Expungement (§ 4 - Discretionary)';
      result.statuteUrl = 'https://iga.in.gov/laws/2024/ic/titles/35#35-38-9-4';
      result.waitingPeriod = 8;
      result.waitingPeriodMet = elapsed >= 8;
      if (dispositionDate) {
        result.eligibilityDate = new Date(dispositionDate);
        result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
      }
      result.filingFee = 157;
      result.grantType = 'discretionary';

      // Check sentence completion date under IC § 35-38-9-4(c)(2) (at least 3 years after sentence completion)
      const sentenceCompletedRaw = caseData.sentenceCompletedDate || caseData.ccs?.financials?.sentenceCompletedDate;
      const sentenceCompletedDate = parseDate(sentenceCompletedRaw);
      if (sentenceCompletedDate) {
        result.sentenceCompletedDate = sentenceCompletedDate;
        const sentenceElapsed = yearsElapsed(sentenceCompletedDate, asOf);
        result.sentenceYearsElapsed = sentenceElapsed;
        if (sentenceElapsed < 3) {
          result.eligible = false;
          result.sentencePeriodMet = false;
          result.waitingPeriodMet = false;
          result.reason = `NOT YET ELIGIBLE: Under IC § 35-38-9-4(c)(2), you must wait at least 3 years after sentence completion (only ${sentenceElapsed} year(s) elapsed since sentence completion).`;
          result.warnings.push(`Sentence completion waiting period not met: At least 3 years must elapse after sentence completion (probation/commitment/restitution discharge). Sentence ended: ${sentenceCompletedDate.toLocaleDateString()}.`);
          return result;
        }
      } else {
        result.warnings.push('Statutory Sentence Rule (IC § 35-38-9-4(c)): Expungement requires waiting at least 8 years from conviction AND at least 3 years from sentence completion (probation, parole, restitution discharge), whichever is later. Confirm sentence completion date.');
      }

      // Enforce the 8-year clean period (IC § 35-38-9-4(e)(2))
      result.eligible = result.waitingPeriodMet && (cleanPeriodYears >= 8);

      if (result.waitingPeriodMet && cleanPeriodYears < 8) {
        result.cleanPeriodBroken = true;
        result.cleanPeriodYears = cleanPeriodYears;
        if (mostRecentConvictionDate) {
          result.eligibilityDate = new Date(mostRecentConvictionDate);
          result.eligibilityDate.setFullYear(result.eligibilityDate.getFullYear() + result.waitingPeriod);
        }
        result.reason = `INELIGIBLE: Clean period broken. You have a subsequent conviction within the last 8 years (IC § 35-38-9-4(e)(2)).`;
        result.warnings.push(`Clean period broken: Subsequent conviction resets your 8-year clean waiting clock.`);
      } else {
        result.reason = result.eligible
          ? `POTENTIALLY ELIGIBLE: ${elapsed} years elapsed. Court has DISCRETION. Requires showing of rehabilitation.`
          : `NOT YET ELIGIBLE: Only ${elapsed} year(s) elapsed. Must wait at least 8 years from conviction.`;
      }
      result.warnings.push('Higher-level felonies require court discretion and are NOT mandatory grants.');
      return result;
    }

    // Fallback: unknown case type
    result.reason = `Unable to classify case type code "${typeCode}". Manual review recommended.`;
    result.warnings.push('Unknown case type — please verify classification manually.');
    return result;
  }

  /**
   * Partition cases by county for separate petition filings.
   */
  function partitionByCounty(cases) {
    const counties = {};
    for (const c of cases) {
      const courtCode = extractCourtCode(c.case_number || c.caseNumber);
      const countyCode = extractCountyCode(courtCode);
      if (!countyCode) continue;

      if (!counties[countyCode]) {
        counties[countyCode] = {
          courtCode: courtCode,
          courtName: c.court || 'Unknown Court',
          cases: []
        };
      }
      counties[countyCode].cases.push(c);
    }
    return counties;
  }

  /**
   * Enforces the IC § 35-38-9-9(d) 365-day multi-county filing rule.
   */
  function checkCrossCounty365DaySafety(cases) {
    let hasEligibleCases = false;
    let maxEligibilityDate = new Date();
    let conflictingCases = [];

    const now = new Date();
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(now.getFullYear() + 1);

    for (const c of cases) {
      if (!c.eligibility) continue;

      if (c.eligibility.statute === 'IC § 35-38-9-1') continue;

      if (c.eligibility.eligible) {
        hasEligibleCases = true;
      }

      if (!c.eligibility.eligible && c.eligibility.eligibilityDate) {
        if (c.eligibility.eligibilityDate > maxEligibilityDate) {
          maxEligibilityDate = c.eligibility.eligibilityDate;
        }
        if (c.eligibility.eligibilityDate > oneYearFromNow) {
          conflictingCases.push(c);
        }
      }
    }

    if (hasEligibleCases && conflictingCases.length > 0) {
      const conflictingCounties = [...new Set(conflictingCases.map(c => c.court || 'Unknown Court'))];
      return {
        isSafe: false,
        reason: 'Cross-County 365-Day Window Violation',
        message: `You have eligible conviction records ready to file, but you also have conviction cases in ${conflictingCounties.join(', ')} that will not be eligible for over a year (until ${maxEligibilityDate.toLocaleDateString()}). Under IC § 35-38-9-9(d) and the lifetime one-shot rule, filing your eligible convictions today would permanently lock out the remaining convictions.`,
        maxEligibilityDate: maxEligibilityDate,
        conflictingCounties: conflictingCounties
      };
    }

    return { isSafe: true };
  }

  /**
   * Run full eligibility analysis on an array of cases.
   */
  function analyzeAll(cases) {
    // PASS 1: Find the most recent criminal conviction date & active pending criminal charges across ALL cases
    let mostRecentConvictionDate = null;
    const pendingCriminalCases = [];

    for (const c of cases) {
      const typeCode = extractCaseTypeCode(c.case_type || c.caseNumber);
      const typeInfo = CASE_TYPE_MAP[typeCode] || null;
      const statusUpper = (c.status || '').toUpperCase();
      const isPending = statusUpper.includes('PENDING') || statusUpper.includes('OPEN') || statusUpper.includes('ACTIVE') || statusUpper.includes('WARRANT');
      const isDecided = statusUpper.includes('DECIDED') || statusUpper.includes('CLOSED') || statusUpper.includes('DISPOSED');
      const isCriminal = typeInfo && ['misdemeanor', 'felony', 'miscellaneous_criminal'].includes(typeInfo.level);

      if (isCriminal && isPending && !isDecided) {
        const cNum = c.case_number || c.caseNumber || 'Unknown Case';
        if (!pendingCriminalCases.includes(cNum)) {
          pendingCriminalCases.push(cNum);
        }
      }

      if (determineConvictionStatus(c, typeInfo)) {
        const dispDate = parseDate(c.dispositionDate) || parseDate(c.ccs?.dispositionDate) || extractDispositionDate(c.status) || parseDate(c.filed);
        if (dispDate && (!mostRecentConvictionDate || dispDate > mostRecentConvictionDate)) {
          mostRecentConvictionDate = dispDate;
        }
      }
    }

    const countyGroups = partitionByCounty(cases);
    const report = {
      totalCases: cases.length,
      counties: {},
      summary: {
        eligible: 0,
        ineligible: 0,
        excluded: 0,
        pending: 0,
        statutorilyBarred: 0,
        totalFilingFee: 0,
        byStatute: {}
      },
      crossCountyBlock: { isSafe: true },
      statutorilyBarredBlock: { isSafe: true },
      pendingChargesBlock: pendingCriminalCases.length > 0 ? {
        isSafe: false,
        reason: 'Active Pending Criminal Charges (Statutory Filing Bar)',
        message: `Under IC § 35-38-9-1(b)(3), § 2(d)(3), and § 3(e)(3), a petitioner cannot file for expungement if ANY criminal charges are pending against them in any court. You have open/pending criminal case(s) (${pendingCriminalCases.join(', ')}) that must be fully resolved before you can petition.`,
        pendingCases: pendingCriminalCases
      } : { isSafe: true }
    };

    const barredCasesList = [];

    for (const [countyCode, group] of Object.entries(countyGroups)) {
      const countyReport = {
        courtCode: group.courtCode,
        courtName: group.courtName,
        cases: [],
        eligibleCount: 0,
        sections: {}
      };

      for (const c of group.cases) {
        // PASS 2: Pass the most recent conviction date into the rules engine
        const assessment = assessEligibility(c, new Date(), mostRecentConvictionDate);

        if (pendingCriminalCases.length > 0) {
          assessment.warnings.push(`Statutory Bar: Expungement filing is prohibited while criminal charges are pending in case(s): ${pendingCriminalCases.join(', ')} (IC § 35-38-9).`);
          assessment.hasPendingChargesBar = true;
        }

        countyReport.cases.push({ ...c, eligibility: assessment });

        if (assessment.isStatutorilyBarred) {
          report.summary.statutorilyBarred++;
          if (assessment.mitigationType === 'strictly_excluded') {
            const cNum = c.case_number || c.caseNumber || 'Unknown Case';
            if (!barredCasesList.includes(cNum)) {
              barredCasesList.push(cNum);
            }
          }
        }

        if (assessment.eligible) {
          countyReport.eligibleCount++;
          report.summary.eligible++;

          const sect = assessment.statute || 'Unknown';
          report.summary.byStatute[sect] = (report.summary.byStatute[sect] || 0) + 1;
          countyReport.sections[sect] = (countyReport.sections[sect] || 0) + 1;

          if (assessment.filingFee && assessment.filingFee > report.summary.totalFilingFee) {
            report.summary.totalFilingFee = assessment.filingFee;
          }
        } else if (assessment.statute === 'N/A') {
          report.summary.excluded++;
        } else {
          report.summary.ineligible++;
        }

        if (assessment.isPending) {
          report.summary.pending++;
        }
      }

      report.counties[countyCode] = countyReport;
    }

    if (barredCasesList.length > 0) {
      report.statutorilyBarredBlock = {
        isSafe: false,
        reason: 'Statutorily Barred Offense Detected',
        message: `Under IC § 35-38-9-3(b) and § 8(b), Indiana law permanently bars certain severe offenses (e.g. Murder, sex offenses under IC § 11-8-8, human trafficking, public corruption) from expungement (${barredCasesList.join(', ')}). While other independent eligible cases may still be petitioned, these barred offenses cannot be expunged.`,
        barredCases: barredCasesList
      };
    }

    const evaluatedCases = [];
    for (const group of Object.values(report.counties)) {
      evaluatedCases.push(...group.cases);
    }
    report.crossCountyBlock = checkCrossCounty365DaySafety(evaluatedCases);

    return report;
  }

  // ─── Indiana County FIPS Code → Name lookup ──────────────────────────
  const INDIANA_COUNTIES = {
    '01': 'Adams', '02': 'Allen', '03': 'Bartholomew', '04': 'Benton',
    '05': 'Blackford', '06': 'Boone', '07': 'Brown', '08': 'Carroll',
    '09': 'Cass', '10': 'Clark', '11': 'Clay', '12': 'Clinton',
    '13': 'Crawford', '14': 'Daviess', '15': 'Dearborn', '16': 'Decatur',
    '17': 'DeKalb', '18': 'Delaware', '19': 'Dubois', '20': 'Elkhart',
    '21': 'Fayette', '22': 'Floyd', '23': 'Fountain', '24': 'Franklin',
    '25': 'Fulton', '26': 'Gibson', '27': 'Grant', '28': 'Greene',
    '29': 'Hamilton', '30': 'Hancock', '31': 'Harrison', '32': 'Hendricks',
    '33': 'Henry', '34': 'Howard', '35': 'Huntington', '36': 'Jackson',
    '37': 'Jasper', '38': 'Jay', '39': 'Jefferson', '40': 'Jennings',
    '41': 'Johnson', '42': 'Knox', '43': 'Kosciusko', '44': 'LaGrange',
    '45': 'Lake', '46': 'LaPorte', '47': 'Lawrence', '48': 'Madison',
    '49': 'Marion', '50': 'Marshall', '51': 'Martin', '52': 'Miami',
    '53': 'Monroe', '54': 'Montgomery', '55': 'Morgan', '56': 'Newton',
    '57': 'Noble', '58': 'Ohio', '59': 'Orange', '60': 'Owen',
    '61': 'Parke', '62': 'Perry', '63': 'Pike', '64': 'Porter',
    '65': 'Posey', '66': 'Pulaski', '67': 'Putnam', '68': 'Randolph',
    '69': 'Ripley', '70': 'Rush', '71': 'St. Joseph', '72': 'Scott',
    '73': 'Shelby', '74': 'Spencer', '75': 'Starke', '76': 'Steuben',
    '77': 'Sullivan', '78': 'Switzerland', '79': 'Tippecanoe', '80': 'Tipton',
    '81': 'Union', '82': 'Vanderburgh', '83': 'Vermillion', '84': 'Vigo',
    '85': 'Wabash', '86': 'Warren', '87': 'Warrick', '88': 'Washington',
    '89': 'Wayne', '90': 'Wells', '91': 'White', '92': 'Whitley'
  };

  function getCountyName(countyCode) {
    return INDIANA_COUNTIES[countyCode] || `County ${countyCode}`;
  }

  // ─── Public API ──────────────────────────────────────────────────────
  return {
    CASE_TYPE_MAP,
    INDIANA_COUNTIES,
    extractCaseTypeCode,
    extractCourtCode,
    extractCountyCode,
    parseDate,
    extractDispositionDate,
    yearsElapsed,
    checkIneligibility,
    assessEligibility,
    partitionByCounty,
    checkCrossCounty365DaySafety,
    analyzeAll,
    getCountyName,
    validateCaseRecord
  };

})();

// Export for content script and sidepanel access
if (typeof window !== 'undefined') {
  window.IndianaExpungement = IndianaExpungement;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IndianaExpungement;
}