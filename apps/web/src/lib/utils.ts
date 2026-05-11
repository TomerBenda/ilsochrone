import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind class-name merger, the shadcn standard. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
