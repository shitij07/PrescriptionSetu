/**
 * Pure Keyword-Based Adherence Reply Classifier.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `SAFETY_INVARIANTS.md` SI-16.
 */

import type { AdherenceClassification } from '../domain/types';

export interface ClassificationResult {
  classification: AdherenceClassification;
  matched_keywords: string[];
  confidence: number;
  is_safety_escalation: boolean;
  reason?: string;
}

// 1. SAFETY-RELEVANT LEXICON (NEEDS_ATTENTION)
const SYMPTOM_KEYWORDS: string[] = [
  // English symptoms
  'dizzy',
  'dizziness',
  'vomit',
  'vomiting',
  'pain',
  'headache',
  'chest pain',
  'rash',
  'itching',
  'nausea',
  'allergic',
  'swelling',
  'breathless',
  'fever',
  'fainted',
  'bleeding',
  'reaction',
  'sick',
  'bad',

  // Marathi Devanagari symptoms
  'चक्कर',
  'उलटी',
  'मळमळ',
  'त्रास',
  'दुखत',
  'दुखणे',
  'रॅश',
  'खाज',
  'सूज',
  'श्वास',
  'छातीत दुखणे',
  'ताप',
  'अस्वस्थ',

  // Marathi Romanized symptoms
  'chakkar',
  'ulti',
  'malmal',
  'tras',
  'dukhate',
  'sooj',
  'khaj',
];

const CESSATION_KEYWORDS: string[] = [
  // English cessation
  'stop',
  'stopped',
  'discontinued',
  'quit',
  "won't take",
  'wont take',
  'will not take',
  'cancelled',

  // Marathi Devanagari cessation
  'बंद',
  'बंद केले',
  'बंद केली',
  'नाही घेणार',
  'घेणार नाही',
  'सोडून दिले',

  // Marathi Romanized cessation
  'band kela',
  'band keli',
  'nahi ghenar',
  'sodun dile',
];

const EXCESS_DOSAGE_KEYWORDS: string[] = [
  // English excess dosage
  'extra dose',
  'double dose',
  'took double',
  'took extra',
  'took 2',
  'took 3',
  'took 4',
  '2 tablets',
  '3 tablets',
  'multiple tablets',

  // Marathi Devanagari excess dosage
  'जास्त गोळ्या',
  '२ गोळ्या',
  '३ गोळ्या',
  'दोन गोळ्या',
  'डबल',

  // Marathi Romanized excess dosage
  'jast golya',
  'don golya',
];

// COMPOUND NEGATED PHRASES (which express missed intent despite containing a positive word)
const NEGATED_TAKEN_PHRASES: string[] = [
  'not taken',
  'not took',
  'could not take',
  'did not take',
  'नाही घेतली',
  'नाही घेतले',
  'नाही दिली',
  'नाही खाल्ली',
  'nahi ghetli',
  'nahi ghetle',
  'nahi liya',
  'nahi khaya',
];

// 2. TAKEN LEXICON
const TAKEN_KEYWORDS: string[] = [
  // English
  'yes',
  'taken',
  'took',
  'done',
  'had it',
  'yep',
  'yeah',
  'ok',
  'completed',
  '1',
  '👍',
  'thumbsup',

  // Marathi Devanagari
  'होय',
  'हो',
  'घेतली',
  'घेतले',
  'घेतलं',
  'खाल्ली',
  'खाल्ले',
  'खाल्लं',
  'झाले',
  'झाली',
  'दिली',
  'घेऊन झाले',

  // Marathi Romanized
  'hoy',
  'ho',
  'ghetli',
  'ghetle',
  'ghetla',
  'khalli',
  'khalle',
  'le liya',
  'kha liya',
];

// 3. MISSED LEXICON
const MISSED_KEYWORDS: string[] = [
  // English
  'no',
  'missed',
  'forgot',
  'not taken',
  'not yet',
  'later',
  'skipped',
  'could not',
  'nope',
  '0',
  '👎',
  'thumbsdown',

  // Marathi Devanagari
  'नाही',
  'नाही घेतली',
  'विसरलो',
  'विसरले',
  'नाही दिली',
  'नंतर घेतो',
  'राहिले',
  'विसरलो होतो',

  // Marathi Romanized
  'nahi',
  'nahin',
  'visarlo',
  'visarle',
  'nahi ghetli',
  'bhul gaya',
  'nahi liya',
];

/**
 * Normalizes text for keyword matching: folds ASCII case, trims, strips punctuation except emoji/scripts.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if normalized text contains the target keyword either as a token or phrase boundary.
 */
function containsKeyword(normalizedText: string, rawText: string, keyword: string): boolean {
  // Emoji / symbol exact or substring match
  if (keyword === '👍' || keyword === '👎') {
    return rawText.includes(keyword);
  }

  const normKeyword = normalizeText(keyword);
  if (!normKeyword) return false;

  // Exact match
  if (normalizedText === normKeyword) return true;

  // Space-delimited token boundary match
  const paddedText = ` ${normalizedText} `;
  const paddedKeyword = ` ${normKeyword} `;
  return paddedText.includes(paddedKeyword);
}

/**
 * Pure, deterministic classifier mapping inbound patient/caregiver reply to an AdherenceClassification.
 * Enforces MASTERPLAN §18.9 safety precedence: `needs_attention` strictly overrides other signals.
 */
export function classifyReply(rawReplyText: string): ClassificationResult {
  if (!rawReplyText || !rawReplyText.trim()) {
    return {
      classification: 'unclear',
      matched_keywords: [],
      confidence: 0,
      is_safety_escalation: false,
      reason: 'EMPTY_INPUT',
    };
  }

  const rawTrimmed = rawReplyText.trim();
  const normalized = normalizeText(rawReplyText);

  // 1. CRITICAL SAFETY CHECK: NEEDS_ATTENTION (Symptoms, Cessation, Overdose)
  const matchedSafetyKeywords: string[] = [];

  for (const kw of SYMPTOM_KEYWORDS) {
    if (containsKeyword(normalized, rawTrimmed, kw)) {
      matchedSafetyKeywords.push(kw);
    }
  }

  for (const kw of CESSATION_KEYWORDS) {
    if (containsKeyword(normalized, rawTrimmed, kw)) {
      matchedSafetyKeywords.push(kw);
    }
  }

  for (const kw of EXCESS_DOSAGE_KEYWORDS) {
    if (containsKeyword(normalized, rawTrimmed, kw)) {
      matchedSafetyKeywords.push(kw);
    }
  }

  if (matchedSafetyKeywords.length > 0) {
    return {
      classification: 'needs_attention',
      matched_keywords: Array.from(new Set(matchedSafetyKeywords)),
      confidence: 1.0,
      is_safety_escalation: true,
      reason: 'SAFETY_KEYWORD_MATCH',
    };
  }

  // 2. CHECK FOR COMPOUND NEGATED PHRASES (e.g. "not taken", "नाही घेतली")
  // If a compound negation phrase matches, it is definitely 'missed' and suppresses false positive 'taken' sub-words
  const matchedNegatedPhrases: string[] = [];
  for (const phrase of NEGATED_TAKEN_PHRASES) {
    if (containsKeyword(normalized, rawTrimmed, phrase)) {
      matchedNegatedPhrases.push(phrase);
    }
  }

  // 3. TAKEN SIGNALS CHECK
  let matchedTakenKeywords: string[] = [];
  if (matchedNegatedPhrases.length === 0) {
    for (const kw of TAKEN_KEYWORDS) {
      if (containsKeyword(normalized, rawTrimmed, kw)) {
        matchedTakenKeywords.push(kw);
      }
    }
  }

  // 4. MISSED SIGNALS CHECK
  const matchedMissedKeywords: string[] = [...matchedNegatedPhrases];
  for (const kw of MISSED_KEYWORDS) {
    if (containsKeyword(normalized, rawTrimmed, kw)) {
      matchedMissedKeywords.push(kw);
    }
  }

  // 5. CONFLICT RESOLUTION: If both Taken and Missed signals exist without safety signals -> UNCLEAR
  if (matchedTakenKeywords.length > 0 && matchedMissedKeywords.length > 0) {
    return {
      classification: 'unclear',
      matched_keywords: [...matchedTakenKeywords, ...matchedMissedKeywords],
      confidence: 0.5,
      is_safety_escalation: false,
      reason: 'CONFLICTING_SIGNALS',
    };
  }

  if (matchedTakenKeywords.length > 0) {
    return {
      classification: 'taken',
      matched_keywords: Array.from(new Set(matchedTakenKeywords)),
      confidence: 0.95,
      is_safety_escalation: false,
    };
  }

  if (matchedMissedKeywords.length > 0) {
    return {
      classification: 'missed',
      matched_keywords: Array.from(new Set(matchedMissedKeywords)),
      confidence: 0.95,
      is_safety_escalation: false,
    };
  }

  // 6. DEFAULT / UNKNOWN: UNCLEAR
  return {
    classification: 'unclear',
    matched_keywords: [],
    confidence: 0,
    is_safety_escalation: false,
    reason: 'NO_MATCHING_LEXICON',
  };
}
