// frontend/src/features/studio/utils/excelParsers.ts
import * as XLSX from 'xlsx';
import {
    HierarchySchoolItem,
    CourseItem,
    OrderCourseSelection,
    ClassGroupItem,
    TeacherAllocationItem,
    LicenseTrayItem,
    ParsedUserRow,
    AccountValidationStats,
    CofExtractionResult,
} from '../../types';
import {
    formatExcelDateClient,
    cleanSchoolText,
    cleanLmsText,
    extractGradeNumberClient,
    matchSchoolWithHierarchy,
    getFormattedDate,
} from './studioFormatters';

/**
 * 1. BÓC TÁCH & VALIDATE FILE EXCEL TẠO TÀI KHOẢN (HỖ TRỢ CẢ FILE COF 3 TABS & FILE DANH SÁCH)
 */
export const parseAccountsExcelFile = async (
    file: File
): Promise<{
    rows: ParsedUserRow[];
    stats: AccountValidationStats;
    isCOF: boolean;
}> => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: false });

    const sheetNames = workbook.SheetNames;
    const isCOF =
        sheetNames.some((s) => s.toLowerCase().includes('student info')) ||
        sheetNames.some((s) => s.toLowerCase() === 'cof');

    let targetSheets: string[] = [];
    if (isCOF) {
        targetSheets = sheetNames.filter(
            (s) => s.toLowerCase().includes('student info') || s.toLowerCase().includes('teacher info')
        );
    } else {
        targetSheets = [sheetNames[0]];
    }

    const parsed: ParsedUserRow[] = [];
    let rGlobalIdx = 1;
    let studentsCount = 0;
    let teachersCount = 0;
    let validRows = 0;
    let errorRows = 0;

    targetSheets.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (rawJson.length < 2) return;

        // Tìm dòng header
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rawJson.length, 15); i++) {
            const rowStr = rawJson[i].map((c) => String(c).toLowerCase()).join(' ');
            if (
                rowStr.includes('first name') ||
                (rowStr.includes('last name') && rowStr.includes('role')) ||
                rowStr.includes('email')
            ) {
                headerRowIndex = i;
                break;
            }
        }
        if (headerRowIndex === -1) headerRowIndex = 0;

        const headers = rawJson[headerRowIndex].map((h) => String(h).trim().toLowerCase());
        const fnIdx = headers.findIndex((h) => h.includes('first name') || h.includes('tên'));
        const lnIdx = headers.findIndex((h) => h.includes('last name') || h.includes('họ'));
        const mobIdx = headers.findIndex((h) => h.includes('mobile') || h.includes('sđt') || h.includes('phone'));
        const emIdx = headers.findIndex((h) => h.includes('email') || h.includes('thư'));
        const dobIdx = headers.findIndex((h) => h.includes('birth') || h.includes('dob') || h.includes('sinh'));
        const roleIdx = headers.findIndex((h) => h.includes('role') || h.includes('vai trò'));

        const rowsToParse = rawJson.slice(headerRowIndex + 1);
        rowsToParse.forEach((row) => {
            if (row.every((cell) => !cell || String(cell).trim() === '')) return;

            const firstName = String(row[fnIdx !== -1 ? fnIdx : 1] || '').trim();
            const lastName = String(row[lnIdx !== -1 ? lnIdx : 2] || '').trim();
            if (!firstName && !lastName) return;

            const mobile = String(row[mobIdx !== -1 ? mobIdx : 3] || '').trim();
            const email = String(row[emIdx !== -1 ? emIdx : 4] || '').trim();
            const dob = formatExcelDateClient(row[dobIdx !== -1 ? dobIdx : 5]);

            let roleRaw = String(row[roleIdx !== -1 ? roleIdx : 6] || '').trim();
            if (!roleRaw && sheetName.toLowerCase().includes('teacher')) roleRaw = 'Teacher';
            if (!roleRaw && sheetName.toLowerCase().includes('student')) roleRaw = 'Student';

            const isStudent = roleRaw.toLowerCase().includes('student');
            const isTeacher = !isStudent;

            if (isStudent) studentsCount++;
            else teachersCount++;

            const errors: string[] = [];
            if (!firstName) errors.push('Thiếu First Name (*)');
            if (!lastName) errors.push('Thiếu Last Name (*)');
            if (!dob) errors.push('Thiếu Ngày sinh (*)');
            if (isTeacher && !email) errors.push('Giáo viên bắt buộc phải có Email (*)');

            const isValid = errors.length === 0;
            if (isValid) validRows++;
            else errorRows++;

            parsed.push({
                index: rGlobalIdx++,
                firstName,
                lastName,
                mobile,
                email,
                dob,
                role: roleRaw || (isStudent ? 'Student' : 'Teacher'),
                isStudent,
                isTeacher,
                isValid,
                errors,
                isDuplicateEmail: false,
            });
        });
    });

    return {
        rows: parsed,
        stats: {
            total: parsed.length,
            students: studentsCount,
            teachers: teachersCount,
            validCount: validRows,
            errorCount: errorRows,
            duplicateCount: 0,
        },
        isCOF,
    };
};

export interface ParseCofResult {
    classAssignments: Record<string, ClassGroupItem[]>;
    unassignedClasses: ClassGroupItem[];
    teachersAllocation: TeacherAllocationItem[];
    parsedCoursesForForm: OrderCourseSelection[];
    extractedSchoolName: string;
    matchedSchool: HierarchySchoolItem | null;
    matchedPartner: { name: string; code: string } | null;
    matchedDistributor: { name: string; code: string } | null;
    extractionResult: CofExtractionResult;
    coursesCount: number;
    totalStudents: number;
    totalTeachers: number;
}

/**
 * 2. THUẬT TOÁN BÓC TÁCH COF THÔNG MINH, HEURISTIC MATCHING VÀ AUTO-FILL PHẢ HỆ
 */
export const parseCofExcelFile = async (
    file: File,
    context: {
        schoolsList: HierarchySchoolItem[];
        workspaceCoursesList: CourseItem[];
    }
): Promise<ParseCofResult> => {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetNames = workbook.SheetNames;

    // -------------------------------------------------------------------------
    // BƯỚC 1: NHẬN DIỆN LOẠI PHÔI (COF vs BULK ACCOUNTS REQUEST FORM)
    // -------------------------------------------------------------------------
    const isCOF = sheetNames.some(
        (s) => s.toLowerCase().includes('cof') || s.toLowerCase().includes('curriculum')
    ) || sheetNames.some((s) => s.toLowerCase().includes('student info'));

    const dateSuffix = new Date().toLocaleString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '');
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);
    nextYear.setDate(nextYear.getDate() - 1);

    // =========================================================================
    // NHÁNH A: XỬ LÝ PHÔI BULK ACCOUNTS (NHƯ ẢNH 2 - SHEET TABS LÀ TÊN LỚP)
    // =========================================================================
    if (!isCOF) {
        let extractedSchoolName = '';
        // Cố gắng trích xuất tên trường từ tên file (VD: 2026Mar02_TGSI-COLLEGEOFMAASIN...)
        const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]+/g, ' ');
        const matchedFromFileName = matchSchoolWithHierarchy(cleanFileName, context.schoolsList);
        if (matchedFromFileName.matched) {
            extractedSchoolName = matchedFromFileName.matched.school_name;
        }

        const cleanSchool = cleanLmsText(extractedSchoolName) || 'School';
        const classesMap: Record<string, { count: number; grade: number | null }> = {};
        const teacherMap: Record<string, { name: string; email: string; classes: Set<string> }> = {};
        let totalStudents = 0;
        let totalTeachers = 0;

        // Quét từng Sheet Tab (Mỗi tab thường là 1 lớp: Class 7s, Class 8a...)
        sheetNames.forEach((sheetName) => {
            const ws = workbook.Sheets[sheetName];
            const rawJson: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (rawJson.length < 5) return;

            // Dò dòng Header chứa: First Name, Last Name, Email, Role (Hàng 5 trong ảnh 2)
            let headerRowIndex = -1;
            for (let i = 0; i < Math.min(rawJson.length, 10); i++) {
                const rowStr = rawJson[i].map((c) => String(c).toLowerCase()).join(' ');
                if (rowStr.includes('first name') && (rowStr.includes('role') || rowStr.includes('email'))) {
                    headerRowIndex = i;
                    break;
                }
            }
            if (headerRowIndex === -1) headerRowIndex = 4; // Mặc định hàng 5 (index 4)

            const headers = rawJson[headerRowIndex].map((h) => String(h).trim().toLowerCase());
            const fnIdx = headers.findIndex((h) => h.includes('first name') || h.includes('tên'));
            const lnIdx = headers.findIndex((h) => h.includes('last name') || h.includes('họ'));
            const emIdx = headers.findIndex((h) => h.includes('email'));
            const roleIdx = headers.findIndex((h) => h.includes('role') || h.includes('vai trò'));

            const className = sheetName.trim();
            const gradeNum = extractGradeNumberClient(className);
            let sheetStudentCount = 0;

            const dataRows = rawJson.slice(headerRowIndex + 1);
            dataRows.forEach((row) => {
                const fn = String(row[fnIdx !== -1 ? fnIdx : 1] || '').trim();
                const ln = String(row[lnIdx !== -1 ? lnIdx : 2] || '').trim();
                const email = String(row[emIdx !== -1 ? emIdx : 4] || '').trim().toLowerCase();
                const role = String(row[roleIdx !== -1 ? roleIdx : 6] || '').trim().toLowerCase();

                if (!fn && !ln && !email) return;

                const isTeacher = role.includes('teacher') || role.includes('giáo viên');

                if (isTeacher) {
                    if (email) {
                        if (!teacherMap[email]) {
                            teacherMap[email] = {
                                name: `${fn} ${ln}`.trim() || 'Teacher',
                                email,
                                classes: new Set(),
                            };
                            totalTeachers++;
                        }
                        teacherMap[email].classes.add(className);
                    }
                } else {
                    totalStudents++;
                    sheetStudentCount++;
                }
            });

            if (sheetStudentCount > 0) {
                classesMap[className] = {
                    count: sheetStudentCount,
                    grade: gradeNum,
                };
            }
        });

        // Tự động tìm Môn học tương ứng theo Khối lớp (Grade) từ danh mục môn học
        const traysMap: Record<string, LicenseTrayItem> = {};
        const parsedCoursesForForm: OrderCourseSelection[] = [];
        const newClassAssignments: Record<string, ClassGroupItem[]> = {};
        const unassigned: ClassGroupItem[] = [];

        Object.entries(classesMap).forEach(([className, info]) => {
            const cleanClass = cleanLmsText(className);
            const lmsGroupName = `${cleanSchool} ${cleanClass} ${dateSuffix}`.replace(/\s+/g, ' ').trim();
            const classItem: ClassGroupItem = {
                rawClassName: className,
                lmsGroupName,
                studentsCount: info.count,
                gradeDetected: info.grade,
            };

            // Tìm môn học khớp với Khối lớp trong danh mục môn học (VD: Khối 7 -> SWRP 7)
            let matchedCourse: CourseItem | undefined;
            if (info.grade !== null) {
                matchedCourse = context.workspaceCoursesList.find((c) => {
                    const gradeMatch = c.course_name.match(/SWRP\s*(\d+)/i);
                    return gradeMatch && parseInt(gradeMatch[1], 10) === info.grade;
                });
            }

            if (matchedCourse) {
                const cIdStr = String(matchedCourse.course_id);
                if (!traysMap[cIdStr]) {
                    traysMap[cIdStr] = {
                        courseId: cIdStr,
                        courseName: matchedCourse.course_name,
                        category: matchedCourse.category || 'SWRP',
                        targetGrade: info.grade,
                        quota: info.count,
                        assignedStudentsCount: 0,
                        assignedClasses: [],
                        startDate: getFormattedDate(today),
                        endDate: getFormattedDate(nextYear),
                    };

                    parsedCoursesForForm.push({
                        category: matchedCourse.category || 'SWRP',
                        course_id: matchedCourse.course_id,
                        course_name: matchedCourse.course_name,
                        lms_url: matchedCourse.lms_url || '',
                        licenses: info.count,
                        start_date: getFormattedDate(today),
                        end_date: getFormattedDate(nextYear),
                    });
                } else {
                    traysMap[cIdStr].quota += info.count;
                    const cRow = parsedCoursesForForm.find((c) => String(c.course_id) === cIdStr);
                    if (cRow) cRow.licenses += info.count;
                }

                if (!newClassAssignments[cIdStr]) newClassAssignments[cIdStr] = [];
                newClassAssignments[cIdStr].push(classItem);
            } else {
                unassigned.push(classItem);
            }
        });

        // Chuyển đổi danh sách Giáo viên
        const teachersAlloc: TeacherAllocationItem[] = Object.values(teacherMap).map((t) => {
            const assignedGroups: string[] = [];
            t.classes.forEach((clsName) => {
                assignedGroups.push(`${cleanSchool} ${cleanLmsText(clsName)} ${dateSuffix}`);
            });

            return {
                teacherName: t.name,
                email: t.email,
                assignedCourses: Object.keys(traysMap),
                courseAssign: Object.values(traysMap).map((tray) => tray.courseName).join(' | '),
                assignedLmsGroups: assignedGroups,
            };
        });

        const matchResult = matchSchoolWithHierarchy(extractedSchoolName, context.schoolsList);

        return {
            classAssignments: newClassAssignments,
            unassignedClasses: unassigned,
            teachersAllocation: teachersAlloc,
            parsedCoursesForForm,
            extractedSchoolName,
            matchedSchool: matchResult.matched,
            matchedPartner: matchResult.matched
                ? { name: matchResult.matched.partner_name, code: matchResult.matched.partner_code }
                : null,
            matchedDistributor: matchResult.matched
                ? { name: matchResult.matched.distributor_name, code: matchResult.matched.distributor_code }
                : null,
            extractionResult: {
                fileType: 'BULK_ACCOUNTS', // Đánh dấu là file Bulk Account
                rawSchoolName: extractedSchoolName,
                matchedSchool: matchResult.matched,
                confidence: matchResult.confidence,
                score: matchResult.score,
                coursesCount: Object.keys(traysMap).length,
                studentsCount: totalStudents,
                teachersCount: totalTeachers,
            },
            coursesCount: Object.keys(traysMap).length,
            totalStudents,
            totalTeachers,
        };
    }

    // =========================================================================
    // NHÁNH B: XỬ LÝ PHÔI COF CHUẨN 3 TABS (BẢO TOÀN NGUYÊN BẢN LOGIC CỦA ANH)
    // =========================================================================
    const cofSheetName =
        sheetNames.find((s) => s.toLowerCase().includes('cof') || s.toLowerCase().includes('curriculum')) || sheetNames[0];
    const ws1 = workbook.Sheets[cofSheetName];
    const rawJson1: any[][] = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

    let extractedSchoolName = '';
    if (rawJson1.length > 6) {
        extractedSchoolName = String(rawJson1[5]?.[2] || '').trim(); // Cột C hàng 6
    }

    const cleanSchool = cleanLmsText(extractedSchoolName) || 'School';
    const traysMap: Record<string, LicenseTrayItem> = {};
    const parsedCoursesForForm: OrderCourseSelection[] = [];

    // Quét bảng môn học từ hàng 28
    for (let r = 27; r < rawJson1.length; r++) {
        const row = rawJson1[r];
        const courseIdRaw = row[7]; // Cột H (Course ID)
        if (!courseIdRaw) continue;

        const courseIdStr = String(courseIdRaw).replace(/\.0$/, '').trim();
        const courseNameColG = String(row[6] || '').trim();
        const courseLink = String(row[2] || '').trim();

        const startDate = formatExcelDateClient(row[8]); // Cột I
        const endDate = formatExcelDateClient(row[11]); // Cột L
        const qtyRaw = parseInt(String(row[16] || '0').trim(), 10);
        const licenses = !isNaN(qtyRaw) && qtyRaw > 0 ? qtyRaw : 0;

        if (!startDate && !endDate && licenses === 0) continue;

        const dbCourse = context.workspaceCoursesList.find((c) => String(c.course_id) === courseIdStr);
        const finalCourseName = courseNameColG || dbCourse?.course_name || `Course #${courseIdStr}`;
        const finalCategory =
            dbCourse?.category || (finalCourseName.includes('ASP') ? 'ASP' : finalCourseName.includes('IR') ? 'IR' : 'SWRP');

        const swrpMatch = finalCourseName.match(/SWRP\s*(\d+)/i);
        const targetGrade = swrpMatch ? parseInt(swrpMatch[1], 10) : null;

        const trayItem: LicenseTrayItem = {
            courseId: courseIdStr,
            courseName: finalCourseName,
            category: finalCategory,
            targetGrade,
            quota: licenses,
            assignedStudentsCount: 0,
            assignedClasses: [],
            startDate: startDate || getFormattedDate(today),
            endDate: endDate || getFormattedDate(nextYear),
        };

        traysMap[courseIdStr] = trayItem;

        parsedCoursesForForm.push({
            category: finalCategory,
            course_id: parseInt(courseIdStr, 10) || 1,
            course_name: finalCourseName,
            lms_url: dbCourse?.lms_url || courseLink || '',
            licenses: licenses,
            start_date: trayItem.startDate,
            end_date: trayItem.endDate,
        });
    }

    // ĐỌC TAB 2: STUDENT INFORMATION & GOM LỚP
    const studentSheetName = sheetNames.find((s) => s.toLowerCase().includes('student'));
    const classesMap: Record<string, { count: number; grade: number | null }> = {};
    let totalStudents = 0;

    if (studentSheetName) {
        const ws2 = workbook.Sheets[studentSheetName];
        const rawJson2: any[][] = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });

        for (let r = 6; r < rawJson2.length; r++) {
            const row = rawJson2[r];
            const fn = String(row[2] || '').trim();
            const ln = String(row[3] || '').trim();
            const email = String(row[5] || '').trim();

            if (!fn && !ln && !email) continue;
            if (fn.toLowerCase().includes('total') || ln.toLowerCase().includes('total')) continue;

            totalStudents++;

            const c10 = String(row[10] || '').trim();
            const c9 = String(row[9] || '').trim();
            const c8 = String(row[8] || '').trim();
            const rawClassName = c10 || c9 || c8 || 'Chưa phân lớp (No Class)';

            if (!classesMap[rawClassName]) {
                classesMap[rawClassName] = {
                    count: 0,
                    grade: extractGradeNumberClient(rawClassName),
                };
            }
            classesMap[rawClassName].count++;
        }
    }

    // THUẬT TOÁN GHÉP LỚP VÀO KHAY
    const newClassAssignments: Record<string, ClassGroupItem[]> = {};
    const unassigned: ClassGroupItem[] = [];

    Object.entries(classesMap).forEach(([className, info]) => {
        const cleanClass = cleanLmsText(className);
        const lmsGroupName = `${cleanSchool} ${cleanClass} ${dateSuffix}`.replace(/\s+/g, ' ').trim();

        const classItem: ClassGroupItem = {
            rawClassName: className,
            lmsGroupName,
            studentsCount: info.count,
            gradeDetected: info.grade,
        };

        let matchedTrayId: string | null = null;
        for (const [cid, tray] of Object.entries(traysMap)) {
            if (tray.targetGrade !== null && info.grade === tray.targetGrade) {
                matchedTrayId = cid;
                break;
            }
        }

        if (matchedTrayId) {
            if (!newClassAssignments[matchedTrayId]) newClassAssignments[matchedTrayId] = [];
            newClassAssignments[matchedTrayId].push(classItem);
        } else {
            unassigned.push(classItem);
        }
    });

    // ĐỌC TAB 3: TEACHER INFORMATION (GỘP GIÁO VIÊN & FORWARD-FILL)
    const teacherSheetName = sheetNames.find((s) => s.toLowerCase().includes('teacher'));
    const teachersAlloc: TeacherAllocationItem[] = [];
    let totalTeachers = 0;

    if (teacherSheetName) {
        const ws3 = workbook.Sheets[teacherSheetName];
        const rawJson3: any[][] = XLSX.utils.sheet_to_json(ws3, { header: 1, defval: '' });

        const teacherMap: Record<
            string,
            {
                name: string;
                email: string;
                courses: Set<string>;
                classes: Set<string>;
            }
        > = {};

        let lastTeacherName = '';
        let lastTeacherEmail = '';

        for (let r = 6; r < rawJson3.length; r++) {
            const row = rawJson3[r];
            let tName = String(row[4] || row[5] || '').trim();
            let email = String(row[7] || row[3] || '').trim().toLowerCase();
            const courseAssign = String(row[10] || '').trim();
            const rawTargetClass = String(row[2] || '').trim();

            if (!courseAssign && !tName && !email) continue;

            if (!email && lastTeacherEmail) {
                email = lastTeacherEmail;
                tName = tName || lastTeacherName;
            } else if (email) {
                lastTeacherEmail = email;
                lastTeacherName = tName || lastTeacherName;
            }

            if (!email) continue;

            if (!teacherMap[email]) {
                teacherMap[email] = {
                    name: tName || 'Teacher',
                    email,
                    courses: new Set(),
                    classes: new Set(),
                };
            }

            const splittedCourses = courseAssign.split(/[\n,;]+/).map((c) => c.trim()).filter((c) => c.length > 0);
            splittedCourses.forEach((c) => teacherMap[email].courses.add(c));
            if (rawTargetClass) teacherMap[email].classes.add(rawTargetClass);
        }

        Object.values(teacherMap).forEach((t) => {
            totalTeachers++;
            const assignedCourseIds = new Set<string>();
            const assignedGroups = new Set<string>();

            t.courses.forEach((cStr) => {
                Object.values(traysMap).forEach((tray) => {
                    if (
                        tray.courseName.toLowerCase().includes(cStr.toLowerCase()) ||
                        (tray.targetGrade && cStr.toLowerCase().includes(`swrp ${tray.targetGrade}`))
                    ) {
                        assignedCourseIds.add(tray.courseId);

                        if (t.classes.size > 0) {
                            t.classes.forEach((clsName) => {
                                if (tray.assignedClasses.some((ac) => ac.rawClassName === clsName)) {
                                    assignedGroups.add(`${cleanSchool} ${cleanLmsText(clsName)} ${dateSuffix}`);
                                }
                            });
                        } else {
                            tray.assignedClasses.forEach((ac) => assignedGroups.add(ac.lmsGroupName));
                        }
                    }
                });
            });

            teachersAlloc.push({
                teacherName: t.name,
                email: t.email,
                assignedCourses: Array.from(assignedCourseIds),
                courseAssign: Array.from(t.courses).join(' | '),
                assignedLmsGroups: Array.from(assignedGroups),
            });
        });
    }

    // ĐỐI SOÁT PHẢ HỆ VỚI 480 TRƯỜNG
    const matchResult = matchSchoolWithHierarchy(extractedSchoolName, context.schoolsList);

    return {
        classAssignments: newClassAssignments,
        unassignedClasses: unassigned,
        teachersAllocation: teachersAlloc,
        parsedCoursesForForm,
        extractedSchoolName,
        matchedSchool: matchResult.matched,
        matchedPartner: matchResult.matched
            ? { name: matchResult.matched.partner_name, code: matchResult.matched.partner_code }
            : null,
        matchedDistributor: matchResult.matched
            ? { name: matchResult.matched.distributor_name, code: matchResult.matched.distributor_code }
            : null,
        extractionResult: {
            fileType: 'COF',
            rawSchoolName: extractedSchoolName,
            matchedSchool: matchResult.matched,
            confidence: matchResult.confidence,
            score: matchResult.score,
            coursesCount: Object.keys(traysMap).length,
            studentsCount: totalStudents,
            teachersCount: totalTeachers,
        },
        coursesCount: Object.keys(traysMap).length,
        totalStudents,
        totalTeachers,
    };
};