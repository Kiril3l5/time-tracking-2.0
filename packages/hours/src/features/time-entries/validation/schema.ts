import { z } from 'zod';

/**
 * Time entry form validation schema
 */
export const timeEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'Date must be in YYYY-MM-DD format',
    }),
    hours: z.number().min(0).max(24, {
      message: 'Hours must be between 0 and 24',
    }),
    regularHours: z.number().min(0).max(24, {
      message: 'Regular hours must be between 0 and 24',
    }),
    overtimeHours: z.number().min(0).max(24, {
      message: 'Overtime hours must be between 0 and 24',
    }),
    ptoHours: z.number().min(0).max(24, {
      message: 'PTO hours must be between 0 and 24',
    }),
    unpaidLeaveHours: z.number().min(0).max(24, {
      message: 'Unpaid leave hours must be between 0 and 24',
    }),
    description: z.string().optional(),
    projectId: z.string().optional(),
    isTimeOff: z.boolean().default(false),
    timeOffType: z.enum(['pto', 'sick', 'unpaid', 'other']).optional(),
    notes: z.string().optional(),
  })
  .refine(
    data => {
      const totalHours =
        data.regularHours + data.overtimeHours + data.ptoHours + data.unpaidLeaveHours;
      return Math.abs(totalHours - data.hours) < 0.01; // Allow for floating point imprecision
    },
    {
      message: 'Total hours must equal the sum of regular, overtime, PTO, and unpaid leave hours',
      path: ['hours'],
    }
  );

/**
 * Type for the time entry form data based on the schema
 */
export type TimeEntryFormData = z.infer<typeof timeEntrySchema>;
