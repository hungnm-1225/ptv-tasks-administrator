// frontend/src/features/studio/utils/studioFormatters.ts
import { HierarchySchoolItem } from '../../types';

/**
 * Chuyển đổi số serial ngày của Excel (ví dụ 42370) hoặc đối tượng Date thành chuỗi DD/MM/YYYY sạch
 */
export const formatExcelDateClient = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
        const d = new Date(Math.round((val - 25569) * 86400 * 1000));
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const year = d.getUTCFullYear();
        return `${day}/${month}/${year}`;
    }
    if (val instanceof Date) {
        const day = String(val.getDate()).padStart(2, '0');
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const year = val.getFullYear();
        return `${day}/${month}/${year}`;
    }
    const str = String(val).trim().split(' ')[0];
    return str.replace(/-/g, '/');
};

/**
 * Làm sạch chuỗi tên trường học (bỏ dấu tiếng Việt, ký tự đặc biệt, từ khóa thừa) để tăng độ chính xác so khớp
 */
export const cleanSchoolText = (str: string): string => {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Bỏ dấu tiếng Việt
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\b(school|international|sdn|bhd|smk|sma|academy|trường|tieu hoc|thcs|thpt)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Làm sạch text để sinh tên Group LMS chuẩn
 */
export const cleanLmsText = (text: string): string => {
    if (!text) return '';
    return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Nhận diện số khối lớp từ chuỗi (Hỗ trợ phân ban Lớp 11-12 Philippines & Việt Nam)
 */
export const extractGradeNumberClient = (text: string): number | null => {
    if (!text) return null;
    const shsMatch = text.match(/(?:stem|abm|humss|humms|tvl|gas|shs)\s*(\d{1,2})/i);
    if (shsMatch) return parseInt(shsMatch[1], 10);

    const grMatch = text.match(/(?:gr|grade|year|khối|lớp)\s*(\d{1,2})/i);
    if (grMatch) return parseInt(grMatch[1], 10);

    const numMatch = text.match(/\b(\d{1,2})\b/);
    if (numMatch) return parseInt(numMatch[1], 10);
    return null;
};

/**
 * Đối soát tên trường từ COF với 480 trường trong phả hệ theo 3 tầng (Tuyệt đối -> Chứa nhau -> Jaccard Index)
 */
export const matchSchoolWithHierarchy = (
    rawCofName: string,
    hierarchyList: HierarchySchoolItem[]
): {
    matched: HierarchySchoolItem | null;
    confidence: 'high' | 'medium' | 'none';
    score: number;
    cleanedName: string;
} => {
    if (!rawCofName || hierarchyList.length === 0) {
        return { matched: null, confidence: 'none', score: 0, cleanedName: '' };
    }

    const cleanInput = cleanSchoolText(rawCofName);
    if (!cleanInput) {
        return { matched: null, confidence: 'none', score: 0, cleanedName: '' };
    }

    const inputWords = new Set(cleanInput.split(' ').filter((w) => w.length > 1));
    let bestMatch: HierarchySchoolItem | null = null;
    let bestScore = 0;

    for (const s of hierarchyList) {
        const cleanTarget = cleanSchoolText(s.school_name);

        // 1. Khớp tuyệt đối sau khi lọc từ thừa
        if (cleanInput === cleanTarget) {
            return { matched: s, confidence: 'high', score: 1.0, cleanedName: cleanInput };
        }

        // 2. Chứa nhau toàn phần
        if (cleanTarget.includes(cleanInput) || cleanInput.includes(cleanTarget)) {
            const score = Math.min(cleanInput.length, cleanTarget.length) / Math.max(cleanInput.length, cleanTarget.length);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = s;
            }
        }

        // 3. Jaccard Index theo từ vựng
        const targetWords = new Set(cleanTarget.split(' ').filter((w) => w.length > 1));
        let intersection = 0;
        inputWords.forEach((w) => {
            if (targetWords.has(w)) intersection++;
        });
        const union = new Set([...inputWords, ...targetWords]).size;
        const jaccard = union > 0 ? intersection / union : 0;

        if (jaccard > bestScore) {
            bestScore = jaccard;
            bestMatch = s;
        }
    }

    if (bestScore >= 0.7 && bestMatch) {
        return { matched: bestMatch, confidence: 'high', score: bestScore, cleanedName: cleanInput };
    } else if (bestScore >= 0.35 && bestMatch) {
        return { matched: bestMatch, confidence: 'medium', score: bestScore, cleanedName: cleanInput };
    }

    return { matched: null, confidence: 'none', score: bestScore, cleanedName: cleanInput };
};

/**
 * Định dạng Date object thành chuỗi dd-mm-yyyy
 */
export const getFormattedDate = (d: Date): string => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};