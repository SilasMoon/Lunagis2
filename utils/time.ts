// Fix: Removed invalid file header which was causing parsing errors.
import { DEFAULT_START_DATE } from '../config/defaults';

export const START_DATE = DEFAULT_START_DATE;

export const indexToDate = (index: number): Date => {
  const date = new Date(START_DATE.getTime());
  date.setUTCHours(date.getUTCHours() + index);
  return date;
};

export const dateToIndex = (date: Date): number => {
    const hours = (date.getTime() - START_DATE.getTime()) / (1000 * 60 * 60);
    return Math.round(hours);
}

export const indexToDateString = (index: number): string => {
  const date = indexToDate(index);
  // Format to a more compact string, e.g., "Jan 01 2030 00:00"
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).replace(',', '');
};