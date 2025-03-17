import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { timeEntrySchema, TimeEntryFormData } from '../validation/schema';

interface UseTimeEntryFormProps {
  defaultValues?: Partial<TimeEntryFormData>;
  onSubmit: (data: TimeEntryFormData) => void;
}

/**
 * Custom hook for time entry form handling with validation
 */
export function useTimeEntryForm({ defaultValues, onSubmit }: UseTimeEntryFormProps) {
  const form = useForm<TimeEntryFormData>({
    resolver: zodResolver(timeEntrySchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
      hours: 0,
      regularHours: 0,
      overtimeHours: 0,
      ptoHours: 0,
      unpaidLeaveHours: 0,
      isTimeOff: false,
      ...defaultValues,
    },
  });

  const handleSubmit = form.handleSubmit(onSubmit);

  /**
   * Calculate total hours when individual hour types change
   */
  const updateTotalHours = () => {
    const { regularHours, overtimeHours, ptoHours, unpaidLeaveHours } = form.getValues();
    const total =
      Number(regularHours || 0) +
      Number(overtimeHours || 0) +
      Number(ptoHours || 0) +
      Number(unpaidLeaveHours || 0);

    form.setValue('hours', total, { shouldValidate: true });
  };

  /**
   * Handle time off toggle
   */
  const handleTimeOffToggle = (isTimeOff: boolean) => {
    form.setValue('isTimeOff', isTimeOff, { shouldValidate: true });

    if (isTimeOff) {
      // Reset regular and overtime hours for time off
      form.setValue('regularHours', 0, { shouldValidate: false });
      form.setValue('overtimeHours', 0, { shouldValidate: false });
    } else {
      // Reset PTO and unpaid leave hours when not time off
      form.setValue('ptoHours', 0, { shouldValidate: false });
      form.setValue('unpaidLeaveHours', 0, { shouldValidate: false });
      form.setValue('timeOffType', undefined, { shouldValidate: true });
    }

    updateTotalHours();
  };

  return {
    form,
    handleSubmit,
    updateTotalHours,
    handleTimeOffToggle,
    isTimeOff: form.watch('isTimeOff'),
  };
}
