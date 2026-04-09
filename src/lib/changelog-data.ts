/**
 * Changelog entries for the testing environment.
 * Add new entries at the TOP of the array (newest first).
 * The modal shows entries newer than the user's last-dismissed version.
 */

export interface ChangelogEntry {
  version: string;         // Semantic or date-based (used as ID for "last seen")
  date: string;            // Display date
  title: string;           // Short summary
  description: string;     // What changed
  highlights: string[];    // Bullet points
  type: 'feature' | 'fix' | 'security' | 'docs';
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '2026.04.02-notes',
    date: 'April 2, 2026',
    title: 'Notes & @Mentions',
    description: 'Leave notes on any page, tag teammates and projects, and keep conversations organized — all without leaving the app.',
    highlights: [
      'What it does: A built-in notes system that lets your team communicate directly within ProcureFlow — on any project, supplier, or RFP page.',
      'Click the "Notes" button on any page to open a side panel where you can write notes, reply to others, and pin important messages to the top.',
      'Type @ to mention and link to any project, supplier, or RFP. Readers can click the link to jump straight to the referenced page.',
      'For projects, you can link directly to a specific tab (e.g., "Project Indy → Schedule") so your team knows exactly where to look.',
      'If someone clicks a link they don\'t have access to, they\'ll see a message telling them who to contact for access.',
      'The demo database has been refreshed with realistic procurement project data for testing.',
    ],
    type: 'feature',
  },
  {
    version: '2026.04.02-dashboard',
    date: 'April 2, 2026',
    title: 'Project Dashboard, Deliveries & Contracts',
    description: 'See the full picture of your project at a glance with live KPIs and charts. Plus, track deliveries and manage contract terms.',
    highlights: [
      'What it does: The project Overview tab is now a full executive dashboard showing real-time status across schedule, budget, risks, tasks, and more.',
      'At the top: 16 KPI cards showing key metrics like total budget, awarded value, savings, open risks, delivery status, and task progress.',
      'Below: Choose from 10 different charts (Budget vs Award, Risk Heat Map, Schedule Progress, and more) using a dropdown selector.',
      'Everything updates live — when you change a number anywhere in the project, the dashboard reflects it immediately.',
      'Deliveries tab: Track each equipment shipment with multiple date types (target, contracted, vendor planned, actual), quantities, and shipping details.',
      'Contracts tab: A 17-point checklist for each package covering signing, spare parts, warranty, training, and more. Add detailed notes to each term.',
    ],
    type: 'feature',
  },
  {
    version: '2026.04.01-phase3',
    date: 'April 1, 2026',
    title: 'Risk Register, Q&A Log & Task Manager',
    description: 'Track risks, manage internal questions, and keep your team on top of tasks — all within each project.',
    highlights: [
      'What it does: Three new tools inside every project to help your team stay organized and proactive.',
      'Risk Register: Log project risks with severity scoring (impact × likelihood), assign owners, track mitigation actions, and see total financial exposure at a glance.',
      'Q&A / RFI Log: Track internal procurement questions — who asked, who owns the answer, and whether it\'s been resolved. Filter by open or closed status.',
      'Task Manager: A simple to-do list per project. Assign tasks to team members, set due dates, track status, and archive completed items.',
      'Pin Bar: Bookmark any page in ProcureFlow for quick access. Your pins appear at the bottom of every screen so you can jump between projects instantly.',
    ],
    type: 'feature',
  },
  {
    version: '2026.04.01-phase2',
    date: 'April 1, 2026',
    title: 'Financial Tracking',
    description: 'Full financial visibility per equipment package — budgets, change orders, savings, and payment schedules.',
    highlights: [
      'What it does: A dedicated Financials tab in every project that gives you complete control over procurement costs and payment timing.',
      'Change Orders: Create, submit for approval, and track contract modifications with a full audit trail and comment thread per change order.',
      'Savings Tracker: Compare initial bid prices against final negotiated prices (BAFO) to see how much your team saved on each package.',
      'Payment Milestones: Set up customizable payment stages for each package (e.g., deposit, production start, delivery, retention) with percentage allocations and target dates.',
      'Equipment quantities are now tracked on every package and included in Excel imports and exports.',
    ],
    type: 'feature',
  },
  {
    version: '2026.04.01-phase1',
    date: 'April 1, 2026',
    title: 'Projects & Schedule System',
    description: 'The core of ProcureFlow — organize everything under Projects with a powerful schedule engine.',
    highlights: [
      'What it does: Projects are now the central hub of ProcureFlow. Each project contains everything your team needs: schedule, RFPs, financials, deliveries, contracts, risks, Q&A, and tasks.',
      'Define your equipment packages (chillers, transformers, generators, etc.) and track each one through the full procurement lifecycle.',
      'Auto-generate a procurement schedule by entering the Required on Job date and lead time — the system calculates all milestone dates automatically.',
      'View your schedule as an interactive table (click any date to edit) or as a Gantt chart with color-coded milestone bars.',
      'Import and export schedules via Excel with smart column matching — the system merges with existing data instead of overwriting.',
      'Financial summary cards at the top of every project show total budget, awarded value, delta, and how many packages have been bought out.',
      'Create RFPs directly from within a project, and see which packages are covered by which RFP.',
    ],
    type: 'feature',
  },
  {
    version: '2026.03.31-gui',
    date: 'March 31, 2026',
    title: 'Look & Feel Improvements',
    description: 'A cleaner, more consistent interface with better dark mode support and safer delete confirmations.',
    highlights: [
      'What it does: Visual polish across the entire app to make it easier to read, navigate, and use — especially in dark mode.',
      'Consistent color coding: Status badges (active, on-hold, published, etc.) now use distinct colors so you can tell them apart at a glance.',
      'Safer deletions: All delete actions now require you to type the item name before confirming, preventing accidental data loss.',
      'Dark mode improvements: Badges, buttons, and text are now clearly visible in dark mode across every page.',
      'Custom-styled scrollbars that match the app theme.',
      'A red "TESTING ENVIRONMENT" banner appears at the top of the staging app so you always know you\'re not in production.',
    ],
    type: 'fix',
  },
  {
    version: '2026.03.31-security',
    date: 'March 31, 2026',
    title: 'Security & Access Control',
    description: 'Your data is protected with role-based permissions, client isolation, and a complete audit trail.',
    highlights: [
      'What it does: A comprehensive security upgrade ensuring that sensitive procurement data is only visible to authorized team members.',
      'Role-based access: Viewers can only read data, Editors can make changes, and Admins have full control including user management.',
      'Client isolation: Team members only see data for the clients they\'re assigned to — no cross-client visibility.',
      'Supplier portal security: Access codes are verified server-side with automatic lockout after failed attempts.',
      'Audit trail: Every important action (creating, editing, deleting, approving) is permanently logged with who did it and when. Admins can review the full trail in Dev Tools.',
      'New team members must be invited by an admin before they can access the system.',
    ],
    type: 'security',
  },
];

/** Get the latest changelog version string */
export function getLatestVersion(): string {
  return CHANGELOG[0]?.version || '';
}
