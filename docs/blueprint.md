# **App Name**: ProcureFlow

## Core Features:

- Supplier Registration and Management: Allow administrators to register suppliers with detailed information, including contact details, categories, documents, and performance ratings. Data is stored in Firestore.
- RFP Creation and Publication: Enable administrators to create RFPs with title, description, open/close dates, and attachments. Support different statuses (draft, published, closed). Data is stored in Firestore.
- Proposal Submission: Allow suppliers to submit proposals including attached files, price, and comments. Data stored in Firestore, files in Firebase Storage.
- Proposal Evaluation: Evaluators can enter technical and commercial scores and add comments. The system automatically calculates a final weighted score (technical 60%, commercial 40%). Data is stored in Firestore.
- Proposal Comparison: Generate a comparison table of proposals, including supplier, price, technical score, commercial score, and final score, highlighting the best overall score.
- Automated Status Updates: Automatically update the status of RFPs based on open and close dates. Automatically update the proposal status upon submission and review. RFP and Proposal data are stored in Firestore.
- User Authentication: Implement email/password authentication using Firebase Authentication. Restrict access to internal pages for authenticated users only.

## Style Guidelines:

- Primary color: Deep sky blue (#3498DB), suggesting trust and professionalism, contrasting with the light theme.
- Background color: Very light gray (#F0F0F0), almost white, to maintain a clean and uncluttered appearance in a light theme.
- Accent color: Emerald green (#2ECC71), analogous to the primary but with a different brightness/saturation, used for highlighting important actions and success states.
- Body and headline font: 'Inter', a grotesque-style sans-serif font with a modern and neutral look, suitable for both headlines and body text. 
- Clean, table-based layouts for lists of suppliers and RFPs, combined with simple, intuitive forms for data entry. Use clear navigation menus for accessibility.
- Simple and professional icons from a set like Material Design Icons, indicating actions like 'edit,' 'delete,' 'upload,' and 'download.'
- Subtle transitions and feedback animations to enhance user experience during form submissions or data updates. For example, a loading animation during file uploads or a confirmation animation upon successful form submission.