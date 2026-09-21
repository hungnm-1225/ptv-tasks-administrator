// frontend/src/features/inbox/types.ts

export interface HierarchySchoolItem {
    school_id: string;
    school_code: string;
    school_name: string;
    partner_name: string;
    partner_code?: string;
    distributor_name: string;
    distributor_code?: string;
    full_lineage: string;
}

export interface PreviewAttachmentFile {
    filename: string;
    url: string;
}

export interface SpreadsheetPreviewData {
    sheetNames: string[];
    activeSheet: string;
    sheetsData: Record<string, string[][]>;
}