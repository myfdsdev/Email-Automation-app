import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date, fmt = 'MMM d, yyyy') {
  if (!date) return '—';
  try { return format(new Date(date), fmt); } catch { return '—'; }
}

export function formatDateTime(date) {
  return formatDate(date, 'MMM d, yyyy h:mm a');
}

export function timeAgo(date) {
  if (!date) return '—';
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); } catch { return '—'; }
}

export function inboxTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}

export function fullName(c) {
  if (!c) return '';
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.email || '';
}

export function compactNumber(n) {
  if (n == null) return '—';
  return Intl.NumberFormat('en', { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
}

export function pctChange(current, previous) {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function titleCase(s = '') {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function stripHtml(html = '') {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}
