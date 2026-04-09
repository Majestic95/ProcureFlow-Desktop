/**
 * Unified color palette for all status types across ProcureFlow.
 * Use these constants instead of hard-coded Tailwind classes.
 * All colors work in both light and dark mode.
 */

// --- Project Status ---
export const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  'on-hold': 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  completed: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
  archived: 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-200',
};

// --- RFP Status ---
export const RFP_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  published: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100',
  closed: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
};

// --- RAG Status (solid badges with white text) ---
export const RAG_COLORS: Record<string, string> = {
  'on-track': 'bg-emerald-600 text-white',
  'at-risk': 'bg-amber-500 text-white',
  'late': 'bg-red-600 text-white',
  'done': 'bg-sky-600 text-white',
};

// --- Proposal Status ---
export const PROPOSAL_STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-violet-200 text-violet-800 dark:bg-violet-800 dark:text-violet-100',
  underReview: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  approved: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  rejected: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
};

// --- Change Order Status ---
export const CO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  submitted: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  approved: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  rejected: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
};

// --- Payment Status ---
export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  invoiced: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  paid: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
};

// --- Risk Rating ---
export const RISK_RATING_COLORS: Record<string, string> = {
  low: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  medium: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  high: 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-100',
  critical: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
};

// --- Risk Status ---
export const RISK_STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  mitigated: 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
  closed: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

// --- Question Status ---
export const QUESTION_STATUS_COLORS: Record<string, string> = {
  open: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  closed: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
};

// --- Todo Status ---
export const TODO_STATUS_COLORS: Record<string, string> = {
  open: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  'in-progress': 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  done: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
};

// --- Delivery Status ---
export const DELIVERY_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  'in-transit': 'bg-sky-200 text-sky-800 dark:bg-sky-800 dark:text-sky-100',
  delivered: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  delayed: 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-100',
};

// --- Contract Term Status ---
export const CONTRACT_TERM_COLORS: Record<string, string> = {
  complete: 'bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100',
  incomplete: 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-100',
  na: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
};

// --- Financial Indicators ---
export const FINANCIAL_COLORS = {
  underBudget: 'text-emerald-500',
  overBudget: 'text-red-500',
  neutral: '',
};

// --- Discipline Colors (for Gantt and grouping) ---
export const DISCIPLINE_COLORS: Record<string, string> = {
  Mechanical: '#3b82f6',
  Electrical: '#f59e0b',
  Civil: '#10b981',
  Others: '#8b5cf6',
};
