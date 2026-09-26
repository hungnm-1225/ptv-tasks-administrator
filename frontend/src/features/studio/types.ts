// frontend/src/features/studio/types.ts
import { BotType } from '../../types';

export interface HierarchySchoolItem {
    school_id: string;
    school_code: string;
    school_name: string;
    partner_name: string;
    partner_code: string;
    distributor_name: string;
    distributor_code: string;
    full_lineage: string;
}

export interface CourseItem {
    id?: string;
    course_id: number;
    category: string;
    course_name: string;
    lms_url: string;
    git_repos?: { repo_url: string; target: 'teacher_only' | 'all' }[];
}

export interface OrderCourseSelection {
    category: string;
    course_id: number;
    course_name: string;
    lms_url: string;
    licenses: number;
    start_date: string;
    end_date: string;
}

export interface LmsCourseSelectionItem {
    category: string;
    course_id: number;
    course_name: string;
    start_date: string;
    end_date: string;
    group_name: string;
}

export interface ScrapedPendingItem {
    id?: string;
    data_id?: string;
    order_code?: string;
    contract_code?: string;
    school_name?: string;
    school_code?: string;
    partner_name?: string;
    partner_code?: string;
    distributor_name?: string;
    distributor_code?: string;
    sender_name?: string;
    receiver_name?: string;
    created_at?: string;
    order_date?: string;
    contract_date?: string;
    date?: string;
    type?: string;
    status?: string;
    notes?: string;
    courses_data?: any[];
}

export interface PreparedTaskSummary {
    engineName: string;
    actionTitle: string;
    targetEntity: string;
    detailsList: string[];
}

export interface ClassGroupItem {
    rawClassName: string;
    lmsGroupName: string;
    studentsCount: number;
    gradeDetected: number | null;
}

export interface TeacherAllocationItem {
    teacherName: string;
    email: string;
    assignedCourses: string[]; // Danh sách các Course ID giáo viên phụ trách (VD: ['679', '654'])
    courseAssign?: string;     // Text tóm tắt hiển thị
    assignedLmsGroups: string[]; // Danh sách Group LMS được tham gia
}

export interface LicenseTrayItem {
    courseId: string;
    courseName: string;
    category: string;
    targetGrade: number | null;
    quota: number;             // Hạn ngạch giấy phép mua (Cột Q)
    assignedStudentsCount: number;
    assignedClasses: ClassGroupItem[];
    startDate: string;
    endDate: string;
}

export interface ParsedUserRow {
    index: number;
    firstName: string;
    lastName: string;
    mobile: string;
    email: string;
    dob: string;
    role: string;
    isStudent: boolean;
    isTeacher: boolean;
    isValid: boolean;
    errors: string[];
    isDuplicateEmail: boolean;
}

export interface AccountValidationStats {
    total: number;
    students: number;
    teachers: number;
    validCount: number;
    errorCount: number;
    duplicateCount: number;
}

export interface LiveExecutedTask {
    id: string;
    status: string;
    resultUrl?: string;
    logs?: string;
    request_id?: string;
}

export interface LoadedUserProfile {
    userId: string;
    userLogin: string;
    countryId: string;
    cityId: string;
    idUserMD: string;
    userRole: string;
}

export interface CofExtractionResult {
    fileType?: 'COF' | 'BULK_ACCOUNTS';
    rawSchoolName: string;
    matchedSchool: HierarchySchoolItem | null;
    confidence: 'high' | 'medium' | 'none';
    score: number;
    coursesCount: number;
    studentsCount: number;
    teachersCount: number;
}

export interface PreparedPayload {
    bot_type: BotType | 'lms_playwright' | 'git_collaborator';
    payload_data: Record<string, any>;
    summary: PreparedTaskSummary;
}

export interface AvailableGitRepo {
    repo_url: string;
    repo_name: string;
    course_name: string;
    category: string;
    target: 'teacher_only' | 'all';
}