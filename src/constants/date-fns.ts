import { format, getYear } from 'date-fns';
import { es } from 'date-fns/locale';

const now = new Date();

export const CURRENT_YEAR = getYear(now);
export const CURRENT_MONTH = format(now, 'MMMM', { locale: es }).replace(
  /^\w/,
  (c) => c.toUpperCase(),
);
