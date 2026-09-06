/**
 * Adherence Reply Classifier Unit Tests.
 * Authoritative sources: `BUILD_ORDER.md` §4 Step 7, `PercriptionSetuMASTERPLAN.md` §18.9, `SAFETY_INVARIANTS.md` SI-16.
 */

import { classifyReply } from '../../src/adherence/classifier';

describe('Adherence Reply Classifier', () => {
  describe('Taken Classifications', () => {
    const englishTakenCases = [
      'yes',
      'YES',
      'Yes',
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
      'Yes, taken.',
    ];

    test.each(englishTakenCases)('classifies English taken reply "%s" as taken', (input) => {
      const result = classifyReply(input);
      expect(result.classification).toBe('taken');
      expect(result.is_safety_escalation).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    const marathiDevanagariTakenCases = [
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
      'होय, घेतली.',
    ];

    test.each(marathiDevanagariTakenCases)(
      'classifies Marathi Devanagari taken reply "%s" as taken',
      (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('taken');
        expect(result.is_safety_escalation).toBe(false);
      },
    );

    const marathiRomanizedTakenCases = [
      'ho',
      'hoy',
      'ghetli',
      'ghetle',
      'ghetla',
      'khalli',
      'khalle',
      'le liya',
      'kha liya',
    ];

    test.each(marathiRomanizedTakenCases)(
      'classifies Romanized Marathi taken reply "%s" as taken',
      (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('taken');
        expect(result.is_safety_escalation).toBe(false);
      },
    );
  });

  describe('Missed Classifications', () => {
    const englishMissedCases = [
      'no',
      'NO',
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
      'No, I forgot.',
    ];

    test.each(englishMissedCases)('classifies English missed reply "%s" as missed', (input) => {
      const result = classifyReply(input);
      expect(result.classification).toBe('missed');
      expect(result.is_safety_escalation).toBe(false);
    });

    const marathiDevanagariMissedCases = [
      'नाही',
      'नाही घेतली',
      'विसरलो',
      'विसरले',
      'नाही दिली',
      'नंतर घेतो',
      'राहिले',
      'विसरलो होतो',
    ];

    test.each(marathiDevanagariMissedCases)(
      'classifies Marathi Devanagari missed reply "%s" as missed',
      (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('missed');
        expect(result.is_safety_escalation).toBe(false);
      },
    );

    const marathiRomanizedMissedCases = [
      'nahi',
      'nahin',
      'visarlo',
      'visarle',
      'nahi ghetli',
      'bhul gaya',
      'nahi liya',
    ];

    test.each(marathiRomanizedMissedCases)(
      'classifies Romanized Marathi missed reply "%s" as missed',
      (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('missed');
        expect(result.is_safety_escalation).toBe(false);
      },
    );
  });

  describe('Needs Attention (Safety Escalation) Classifications', () => {
    describe('Symptom / Adverse Reaction Keywords', () => {
      const englishSymptoms = [
        'dizzy',
        'feeling dizzy',
        'vomit',
        'vomiting',
        'severe pain',
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
        'bad reaction',
        'sick',
      ];

      test.each(englishSymptoms)('classifies symptom reply "%s" as needs_attention', (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });

      const marathiDevanagariSymptoms = [
        'चक्कर',
        'चक्कर येत आहे',
        'उलटी',
        'उलटी होत आहे',
        'मळमळ',
        'त्रास',
        'खूप त्रास होतोय',
        'दुखत',
        'दुखणे',
        'रॅश',
        'खाज',
        'सूज',
        'श्वास',
        'छातीत दुखणे',
        'ताप',
        'अस्वस्थ',
      ];

      test.each(marathiDevanagariSymptoms)(
        'classifies Marathi symptom reply "%s" as needs_attention',
        (input) => {
          const result = classifyReply(input);
          expect(result.classification).toBe('needs_attention');
          expect(result.is_safety_escalation).toBe(true);
        },
      );

      const marathiRomanizedSymptoms = [
        'chakkar',
        'chakkar yet aahe',
        'ulti',
        'malmal',
        'tras hotoy',
        'dukhate',
        'rash',
        'khaj',
        'sooj',
      ];

      test.each(marathiRomanizedSymptoms)(
        'classifies Romanized symptom reply "%s" as needs_attention',
        (input) => {
          const result = classifyReply(input);
          expect(result.classification).toBe('needs_attention');
          expect(result.is_safety_escalation).toBe(true);
        },
      );
    });

    describe('Medication Cessation Keywords', () => {
      const cessationCases = [
        'stop',
        'I stopped taking this',
        'discontinued',
        'quit',
        "won't take",
        'will not take',
        'cancelled',
        'बंद',
        'औषध बंद केले',
        'बंद केली',
        'नाही घेणार',
        'घेणार नाही',
        'सोडून दिले',
        'band kela',
        'band keli',
        'nahi ghenar',
      ];

      test.each(cessationCases)('classifies cessation reply "%s" as needs_attention', (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });
    });

    describe('Excess Dosage / Quantity Keywords', () => {
      const excessDoseCases = [
        'extra dose',
        'double dose',
        'took double',
        'took extra',
        'took 2',
        'took 3',
        'took 4',
        'took 2 tablets',
        'multiple tablets',
        'जास्त गोळ्या',
        '२ गोळ्या घेतल्या',
        '३ गोळ्या',
        'दोन गोळ्या',
        'डबल गोळी',
        'jast golya',
        'don golya',
      ];

      test.each(excessDoseCases)('classifies excess dose reply "%s" as needs_attention', (input) => {
        const result = classifyReply(input);
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });
    });

    describe('Critical Safety Precedence Rules', () => {
      it('strictly overrides "taken" words when safety symptoms are present', () => {
        const result = classifyReply('Yes I took it but feeling dizzy');
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
        expect(result.matched_keywords).toContain('dizzy');
      });

      it('strictly overrides Marathi "taken" words when cessation is reported', () => {
        const result = classifyReply('होय पण औषध बंद केले');
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });

      it('strictly overrides Romanized "taken" words when vomiting is reported', () => {
        const result = classifyReply('ho ghetli pan ulti zali');
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });

      it('strictly overrides "missed" words when severe symptoms are present', () => {
        const result = classifyReply('No, did not take because chest pain');
        expect(result.classification).toBe('needs_attention');
        expect(result.is_safety_escalation).toBe(true);
      });
    });
  });

  describe('Unclear and Ambiguous Classifications', () => {
    it('classifies unknown / unhandled free text as unclear', () => {
      const result = classifyReply('Where is the doctor?');
      expect(result.classification).toBe('unclear');
      expect(result.is_safety_escalation).toBe(false);
      expect(result.confidence).toBe(0);
    });

    it('classifies random gibberish as unclear', () => {
      const result = classifyReply('asdfghjkl qwerty 12345');
      expect(result.classification).toBe('unclear');
    });

    it('classifies contradictory taken and missed signals without safety signals as unclear', () => {
      const result = classifyReply('yes no');
      expect(result.classification).toBe('unclear');
    });

    it('classifies empty or whitespace-only strings as unclear', () => {
      expect(classifyReply('').classification).toBe('unclear');
      expect(classifyReply('   ').classification).toBe('unclear');
      expect(classifyReply('...').classification).toBe('unclear');
    });
  });
});
