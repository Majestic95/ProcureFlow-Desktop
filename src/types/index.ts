
import type { Timestamp } from '@/lib/firestore-compat';
import type { RunAnalysisOutput } from '@/ai/flows/run-analysis';

export interface Client {
  id: string;
  name: string;
  industry?: string;
  contactName?: string;
  contactEmail?: string;
  logoUrl?: string | null;
  createdAt: Timestamp | Date;
}

export interface SupplierContact {
    name: string;
    role: string;
    email: string;
    phone: string;
}

export interface EstimatedRevenueItem {
    year: number;
    amountUsd: number;
}

export interface EstimatedPersonnelItem {
    year: number;
    headcount: number;
}

export interface Supplier {
  id: string;
  companyName: string;
  contacts: SupplierContact[];
  address: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  categories: string[];
  documents: { name: string; url: string }[];
  rating: number;
  estimatedRevenue?: EstimatedRevenueItem[];
  estimatedPersonnel?: EstimatedPersonnelItem[];
  createdAt: Timestamp | Date;
}

export type RfpFlowType = "simple" | "advanced";

export interface RfpPrepStageData {
  overview: {
    objectives: string;
    scopeSummary: string;
    assumptions: string;
  };
  documentation: {
    hasDraftScope: boolean;
    hasPricingTemplate: boolean;
    hasTandCs: boolean;
    notes: string;
  };
  evaluationDesign: {
    criteriaSummary: string;
    weightingApproach: string;
    mustHaveRequirements: string;
  };
  communicationPlan: {
    bidderQandAProcess: string;
    siteVisitPlan: string;
    keyDatesNotes: string;
  };
  attachments: { name: string; url: string }[];
}

export interface BidInvitedSupplier {
  supplierId: string;
  supplierName: string;
  contactName?: string;
  contactEmail?: string;
  invitedOn?: string;
  status: "invited" | "declined" | "confirmed";
  accessCode?: string;
}

export interface RfpQuestion {
  id: string;
  rfpId: string;
  supplierId: string;
  supplierName?: string;
  question: string;
  questionAttachments?: { name: string; url: string }[];
  answer?: string;
  answerAttachments?: { name: string; url: string }[];
  isPublic: boolean;
  createdAt: Timestamp | Date;
  answeredAt?: Timestamp | Date;
}

export interface BidCommunicationEntry {
  id: string;
  date: string;
  type: "clarification" | "addendum" | "notice";
  summary: string;
}

export interface BidSubmission {
  supplierId: string;
  supplierName: string;
  receivedOn?: string;
  reference?: string;
  submissionStatus: "not_received" | "received" | "late";
  notes: string;
}

export interface BidStageData {
  launchDetails: {
    issueDate?: string;
    submissionDeadline?: string;
    clarificationDeadline?: string;
    submissionMethod: string;
    additionalInstructions: string;
  };
  invitedSuppliers: BidInvitedSupplier[];
  communicationLog: BidCommunicationEntry[];
  submissions: BidSubmission[];
  attachments: { name: string; url: string }[];
}

export interface BidAnalysisProposalRow {
  id: string;
  supplierName: string;
  revision?: number;
  status: "Not received" | "Received" | "Late";
  totalPrice?: number | null;
  commScore?: number | null;
  ehsScore?: number | null;
  schedScore?: number | null;
  qualScore?: number | null;
  riskScore?: number | null;
}

export interface BidAnalysisStageData {
  evaluationApproach: string;
  commercialSummary: string;
  technicalSummary: string;
  riskSummary: string;
  recommendationNotes: string;
  aiSummary?: string;
  lastAiRunAt?: string;
  proposals: BidAnalysisProposalRow[];
}


export interface RfpadvancedStages {
    rfpPrep?: RfpPrepStageData;
    bid?: BidStageData;
    bidAnalysis?: BidAnalysisStageData;
}


export interface EvaluationWeights {
  commercial: number;
  ehs: number;
  schedule: number;
  quality: number;
  risk: number;
}

export interface RFP {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'closed';
  flowType: RfpFlowType;
  countryCode: string;
  stateCode: string;
  cityName: string;
  openDate: Timestamp | Date;
  closeDate: Timestamp | Date;
  executionStartDate?: Timestamp | Date;
  executionEndDate?: Timestamp | Date;
  eoiDeadline?: Timestamp | Date;
  procurementContact?: {
    name: string;
    email: string;
    role: string;
    phone: string;
  };
  budget: number;
  clientId?: string; // Optional for backward compatibility, required in forms going forward
  isConfidential: boolean;
  createdBy: string; // User ID
  attachedFiles: { 
    name: string; 
    url: string; 
    id?: string;
    uploadedAt?: string;
    versions?: { name: string; url: string; uploadedAt: string }[];
  }[];
  createdAt: Timestamp | Date;
  selectedSupplierIds?: string[];
  supplierAccessCodes?: Record<string, string>;
  blockedSupplierIds?: string[];
  completedStages?: string[];
  aiAnalysisSummary?: string;
  aiScheduleData?: RunAnalysisOutput['scheduleData'];
  aiAnalysisSections?: Record<string, string>;
  advancedStages?: RfpadvancedStages;
  evaluationWeights?: EvaluationWeights;
  awardedSupplierId?: string;

  // Project linkage
  projectId?: string;
  packageIds?: string[];
}

export interface Proposal {
  id: string;
  rfpId: string;
  supplierId: string;
  supplierName?: string;
  clientId?: string;
  revision?: number;
  submittedAt: Timestamp | Date;
  price: number;
  commercialScore: number;
  ehsScore: number;
  scheduleScore: number;
  qualityScore: number;
  riskScore: number;
  finalScore: number;
  attachments: { name: string; url: string }[];
  aiSummary: string;
  evaluatorComments: string;
  status: 'submitted' | 'underReview' | 'approved' | 'rejected';
}

export interface Evaluation {
  id: string;
  proposalId: string;
  evaluatorId: string; // User ID
  technicalScore: number;
  commercialScore: number;
  finalScore: number;
  comments: string;
  createdAt: Timestamp;
}

export interface Coverage {
    id: string; // <countryCode>_<stateCode>
    supplierId: string;
    countryCode: string;
    countryName: string;
    stateCode: string;
    stateName: string;
    coverageStatus: 'Preferred' | 'Potential' | 'No coverage';
}

export interface RfpTemplate {
  id: string;
  name: string;
  type: 'email' | 'document';
  category: string;
  subject?: string; // Optional for documents
  body?: string;    // Optional for documents
  fileUrl?: string;  // Required for documents
  fileType?: 'docx' | 'xlsx';
  language: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface Prequalification {
  id: string; // Should be the same as the supplier ID
  supplierId: string;
  
  // Company Profile
  legalEntityName: string;
  yearEstablished: number;
  numberOfEmployees: number;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;

  // HSE
  hasHseSystem: boolean;
  hasSafetyPolicy: boolean;
  trir: { year: number; value: number }[];
  ltifr: { year: number; value: number }[];
  recordableIncidents: { year: number; value: number }[];
  fatalities: { year: number; value: number }[];
  hsePrograms: string;
  hseDocs: { name: string; url: string }[];

  // Quality
  certifications: string[];
  qaQcProcess: string;
  qualityDocs: { name: string; url: string }[];

  // Financial
  annualRevenueRange: '< 5M' | '5–20M' | '20–100M' | '> 100M' | '';
  maxContractSize: number;
  activeProjects: number;
  geographicCoverage: string;

  // Compliance
  hasLitigation: boolean;
  litigationDetails: string;
  hasSanctions: boolean;
  sanctionsDetails: string;
  hasEthicsPolicy: boolean;
  insuranceDocs: { name: string; url: string }[];
  licenseDocs: { name: string; url: string }[];
  
  // References
  references: {
    clientName: string;
    projectName: string;
    location: string;
    scope: string;
    value: number;
    year: number;
  }[];

  // Internal Evaluation
  hseRiskRating: 'Low' | 'Medium' | 'High' | '';
  financialRiskRating: 'Low' | 'Medium' | 'High' | '';
  overallPerformanceRating: number;
  internalComments: string;
  status: 'Draft' | 'Under review' | 'Approved' | 'Rejected';

  updatedAt: Timestamp | Date;
}

// --- Schedule Management ---

export interface MilestoneData {
  plannedDate: string; // ISO date string, 'TBD', or 'N/A'
  adjustedDate: string; // Used as Forecast in UI
  actualDate: string;
}

export interface SchedulePackage {
  id: string;
  name: string;
  awardedSupplierId?: string;
  awardedSupplierName?: string;
  discipline: string;
  milestones: Record<string, MilestoneData>;
  comment?: string;
  associatedRfpId?: string;
}

export interface Schedule {
  id: string;
  clientId: string;
  clientName: string;
  projectName: string;
  packages: SchedulePackage[];
  customDisciplines?: string[];
  milestoneIcons?: Record<string, string>; // Maps milestone key to icon name
  milestoneOrder?: string[]; // Custom sequence of milestone keys
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
  createdBy: string;
}

export const DISCIPLINES = ['Mechanical', 'Electrical', 'Civil', 'Others'] as const;

export const MILESTONE_KEYS = [
  'projectStart',
  'prePurchaseSpec',
  'biddingPeriod',
  'analysisPeriod',
  'techReviewPeriod',
  'loiReleasePeriod',
  'contractPeriod',
  'procurementRecProcess',
  'vendorSelection',
  'timeToSign',
  'poIssue',
  'submittalPeriod',
  'shopDrawingReview',
  'production',
  'delivery',
] as const;

export const MILESTONE_LABELS: Record<string, string> = {
  projectStart: 'Project Start',
  prePurchaseSpec: 'Pre-Purchase Spec',
  biddingPeriod: 'Bidding Period',
  analysisPeriod: 'Analysis Period',
  techReviewPeriod: 'Tech Review Period',
  loiReleasePeriod: 'LOI Release Period',
  contractPeriod: 'Contract Period',
  procurementRecProcess: 'procurement Rec Process',
  vendorSelection: 'Vendor Selection',
  timeToSign: 'Time to Sign',
  poIssue: 'PO Issue',
  submittalPeriod: 'Submittal Period',
  shopDrawingReview: 'Shop Drawing Review',
  production: 'Production',
  delivery: 'Delivery',
};

export const STANDARD_PACKAGES = [
  'Air-Cooled Chillers',
  'Fanwalls',
  'UPS CRAH',
  'Mv Transformer',
  'House Generator',
  'Backup Generator',
  'LV Switch',
  'UPS Bypass Switchboard',
  'House UPS – 20kva',
  'Data Hall UPS – 1500kva',
  'ATV',
  'PDU',
  'STS',
  'Admin Boards',
  'MV Switchgear',
  'Busway',
];

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  position?: string;
  photoURL: string | null;
  role: 'viewer' | 'editor' | 'admin';
  clientIds: string[];
  lastLogin: Timestamp | Date;
  createdAt: Timestamp | Date;
}

// --- Project Management ---

export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type RagStatus = 'on-track' | 'at-risk' | 'late' | 'done';

export interface Project {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export interface EquipmentPackage {
  id: string;
  name: string;
  discipline: string;
  itemNumber: number;

  // Supplier assignment (post-award)
  awardedSupplierId?: string;
  awardedSupplierName?: string;

  // Quantity
  quantity?: number;              // total units being procured (whole number)

  // Financial
  budget?: number;
  awardValue?: number;
  changeOrderTotal?: number;

  // Savings (B3)
  initialBidPrice?: number;
  bafoPrice?: number;

  // Payment milestones (B4)
  paymentMilestones?: PaymentMilestone[];

  // Schedule inputs
  rojDate?: string;
  leadTimeWeeks?: number;
  milestoneDurations?: Record<string, number>;

  // Schedule data
  milestones: Record<string, MilestoneData>;

  // Computed (recalculated on save)
  percentComplete?: number;
  ragStatus?: RagStatus;

  // Links
  rfpIds?: string[];
  associatedRfpId?: string;

  // Metadata
  comment?: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// --- Payment Milestones (B4) ---

export interface PaymentMilestone {
  id: string;
  name: string;                    // e.g., "Order Deposit", "FAT", "Delivery"
  percentage: number;              // % of contract value (0-100)
  targetDate?: string;             // ISO date or 'TBD'
  actualDate?: string;             // ISO date when paid
  status: 'pending' | 'invoiced' | 'paid';
}

export const DEFAULT_PAYMENT_STAGES = [
  'Order Deposit',
  'Design Approval',
  'Production Start',
  '90 Days Before Ship',
  'FAT',
  'Shipment',
  'Delivery',
  'Installation Complete',
  'Startup',
  'Retention Release',
] as const;

// --- Change Orders (B2) ---

export type ChangeOrderStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type ChangeOrderType = 'addition' | 'deletion' | 'scope-change' | 'other';

export interface ChangeOrderComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: Timestamp | Date;
}

export interface ChangeOrder {
  id: string;
  coNumber: string;                // e.g., "CO-001"
  projectId: string;
  packageId: string;
  packageName: string;
  supplierId?: string;
  supplierName?: string;
  changeType: ChangeOrderType;
  title: string;
  description: string;
  value: number;                   // dollar amount (positive = cost increase, negative = credit)
  status: ChangeOrderStatus;
  submittedBy?: string;
  submittedAt?: Timestamp | Date;
  approvedBy?: string;
  approvedAt?: Timestamp | Date;
  rejectedBy?: string;
  rejectedAt?: Timestamp | Date;
  rejectionReason?: string;
  comments: ChangeOrderComment[];
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// --- Risk Register (Phase 3 - E) ---

export type RiskStatus = 'open' | 'mitigated' | 'closed';
export type RiskRating = 'low' | 'medium' | 'high' | 'critical';

export interface Risk {
  id: string;
  riskNumber: string;              // e.g., "R-001"
  title: string;
  description: string;
  status: RiskStatus;
  riskOwner: string;               // name of person responsible
  impact: number;                  // 1-5
  likelihood: number;              // 1-5
  score: number;                   // impact × likelihood (computed)
  rating: RiskRating;              // derived from score
  estimatedFinancialValue?: number;
  weightedFinancialValue?: number; // estimatedFinancialValue × (score / 25)
  estimatedTimeImpact?: string;    // e.g., "2 weeks"
  actionDescription?: string;
  targetCompletionDate?: string;   // ISO date
  actionStatus?: 'pending' | 'in-progress' | 'complete';
  lastUpdated: Timestamp | Date;
  createdBy: string;
  createdAt: Timestamp | Date;
}

// --- Internal Q&A / RFI Log (Phase 3 - F) ---

export type QuestionStatus = 'open' | 'closed';

export interface ProjectQuestion {
  id: string;
  index: number;                   // display order
  status: QuestionStatus;
  dateOpened: Timestamp | Date;
  dateClosed?: Timestamp | Date;
  asker: string;                   // who asked
  owner: string;                   // who is responsible for answering
  answeredBy?: string;
  packageId?: string;              // optional link to equipment package
  packageName?: string;
  vendorName?: string;
  question: string;
  response?: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp | Date;
}

// --- Project To-Do List (Phase 3 - G) ---

export type TodoStatus = 'open' | 'in-progress' | 'done';

export interface ProjectTodo {
  id: string;
  taskNumber: number;
  packageId?: string;
  packageName?: string;
  vendorName?: string;
  description: string;
  assignedTo: string;
  status: TodoStatus;
  comments?: string;
  projectedClosure?: string;       // ISO date
  actualClosure?: string;          // ISO date
  archived: boolean;
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// --- Delivery & Logistics (Phase 4 - C) ---

export interface DeliveryBatch {
  id: string;
  packageId: string;
  packageName: string;
  supplierName?: string;
  batchNumber: number;              // 1, 2, 3... (multiple shipments per package)
  description?: string;             // e.g., "Shipment 1 of 3 — Units 1-3"
  quantity: number;
  incoterms?: string;               // e.g., "EXW", "FOB", "CIF", "DDP"
  departurePoint?: string;
  arrivalPoint?: string;
  rojDate?: string;                 // Required on Job
  rojQty?: number;
  targetDate?: string;              // Target delivery
  targetQty?: number;
  contractedDate?: string;          // Per contract
  contractedQty?: number;
  vendorPlannedDate?: string;       // Vendor's planned date
  vendorPlannedQty?: number;
  actualDate?: string;              // Actual delivery
  actualQty?: number;
  lastUpdated?: Timestamp | Date;
  comments?: string;
  status: 'pending' | 'in-transit' | 'delivered' | 'delayed';
  createdBy: string;
  createdAt: Timestamp | Date;
}

export const INCOTERMS = [
  'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
  'FAS', 'FOB', 'CFR', 'CIF',
] as const;

export const DELIVERY_STATUS_OPTIONS = ['pending', 'in-transit', 'delivered', 'delayed'] as const;

// --- Contract Management (Phase 4 - D) ---

export interface ContractTerm {
  key: string;                      // e.g., "signed", "spare_parts"
  label: string;                    // Display name
  status: 'complete' | 'incomplete' | 'na';
  notes: string;                    // Detailed text
  lastUpdated?: Timestamp | Date;
}

export interface PackageContract {
  id: string;
  packageId: string;
  packageName: string;
  supplierName?: string;
  terms: ContractTerm[];
  createdBy: string;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export const CONTRACT_TERM_KEYS = [
  { key: 'signed', label: 'Contract Signed' },
  { key: 'spare_parts', label: 'Spare Parts' },
  { key: 'ld_terms', label: 'L&D Terms' },
  { key: 'taxes', label: 'Taxes' },
  { key: 'fwt_included', label: 'FWT Included' },
  { key: 'freight_terms', label: 'Freight Terms' },
  { key: 'payment_terms', label: 'Payment Terms' },
  { key: 'delivery_dates', label: 'Delivery Dates' },
  { key: 'cancellation_terms', label: 'Cancellation Terms' },
  { key: 'cdes', label: 'CDEs' },
  { key: 'warranty', label: 'Warranty' },
  { key: 'cx_support', label: 'CX Support' },
  { key: 'startup_support', label: 'Startup Support' },
  { key: 'sat', label: 'Site Acceptance Testing' },
  { key: 'training_services', label: 'Training Services' },
  { key: 'training_docs', label: 'Training Docs' },
  { key: 'open_items', label: 'Open Items / Risks' },
] as const;

// --- Universal Notes System ---

export type NoteEntityType = 'project' | 'supplier' | 'rfp';

export interface Note {
  id: string;
  entityType: NoteEntityType;
  entityId: string;
  entityName: string;
  tab?: string;                    // which tab/section created on
  tabLabel?: string;               // human-readable tab name
  authorId: string;
  authorName: string;
  text: string;
  pinned: boolean;
  parentId: string | null;         // null = top-level, noteId = reply
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

/** Default milestone durations in business days — editable per package */
export const DEFAULT_MILESTONE_DURATIONS: Record<string, number> = {
  projectStart: 0,
  prePurchaseSpec: 3,
  biddingPeriod: 20,
  analysisPeriod: 10,
  techReviewPeriod: 0,
  loiReleasePeriod: 3,
  contractPeriod: 5,
  procurementRecProcess: 5,
  vendorSelection: 2,
  timeToSign: 5,
  poIssue: 0,
  submittalPeriod: 0,
  shopDrawingReview: 0,
  production: 0, // calculated from leadTimeWeeks
  delivery: 0,
};

/** Milestones counted toward % complete (procurement milestones, up to PO Issue) */
export const COMPLETION_MILESTONES = [
  'projectStart',
  'prePurchaseSpec',
  'biddingPeriod',
  'analysisPeriod',
  'techReviewPeriod',
  'loiReleasePeriod',
  'contractPeriod',
  'procurementRecProcess',
  'vendorSelection',
  'timeToSign',
  'poIssue',
] as const;

export interface UserInvite {
  email: string;
  role: 'viewer' | 'editor' | 'admin';
  clientIds: string[];
  invitedBy: string;
  invitedAt: Timestamp | Date;
  status: 'pending' | 'accepted';
  acceptedAt?: Timestamp | Date;
}
