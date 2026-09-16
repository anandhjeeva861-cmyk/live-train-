import { z } from 'zod';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80, 'Use at most 80 characters.')
    .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'’\-]*$/u, 'Enter a name using letters, spaces, apostrophes or hyphens.'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose your date of birth.')
    .refine(value => { const date = new Date(value + 'T00:00:00Z'); return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= today(); }, 'Choose a valid birth date between 1900 and today.'),
  mobileNumber: z.string().trim().max(24).transform(value => value.replace(/[\s()-]/g, ''))
    .refine(value => /^(?:\+91|91|0)?[6-9]\d{9}$/.test(value), 'Enter a valid 10-digit Indian mobile number.')
    .transform(value => value.slice(-10)),
});

export const challengeProfile = row => row && row.firstName && row.dateOfBirth && row.contactMobile
  ? { firstName: row.firstName, dateOfBirth: row.dateOfBirth, mobileNumber: row.contactMobile } : null;
export const profileColumns = profile => ({ firstName: profile.firstName, dateOfBirth: profile.dateOfBirth, contactMobile: profile.mobileNumber });
export const clearedProfile = { firstName: null, dateOfBirth: null, contactMobile: null };
