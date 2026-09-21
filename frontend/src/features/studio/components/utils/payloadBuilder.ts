// frontend/src/features/studio/utils/payloadBuilder.ts
import { toast } from 'sonner';
import {
    HierarchySchoolItem,
    CourseItem,
    OrderCourseSelection,
    LmsCourseSelectionItem,
    ScrapedPendingItem,
    PreparedPayload,
    PreparedTaskSummary,
    ClassGroupItem,
    TeacherAllocationItem,
    ParsedUserRow,
    AccountValidationStats,
    LoadedUserProfile,
} from '../../types';

export interface BuildPayloadParams {
    selectedBotType: 'workspace_rpa' | 'keycloak_api' | 'git_collaborator' | 'feedback_doc_triage';
    workspaceMainCategory: 'approve' | 'create_and_approve' | 'bulk_accounts' | 'lms_enroll' | 'update_user';
    approveSubFlow: 'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract';
    createApproveSubFlow: 'end_to_end' | 'partner_create_chain' | 'distributor_create_chain';
    contactInfo: string;
    additionalNotes: string;
    selectedItemCode: string;
    selectedCachedItem: ScrapedPendingItem | null;
    parsedOrderCourses: any[];
    adminJustification: string;
    selectedSchool: HierarchySchoolItem | null;
    selectedPartner: { name: string; code: string } | null;
    selectedDistributor: { name: string; code: string } | null;
    selectedCourses: OrderCourseSelection[];
    cofClassAssignments: Record<string, ClassGroupItem[]>;
    cofTeachersAllocation: TeacherAllocationItem[];
    uploadedAccountsFile: File | null;
    accountValidationStats: AccountValidationStats;
    parsedAccountRows: ParsedUserRow[];
    lmsSelectedCourses: LmsCourseSelectionItem[];
    lmsCoursesList: CourseItem[];
    workspaceCoursesList: CourseItem[];
    lmsActionType: 'enroll' | 'unenrol';
    lmsUnenrolEmails: string;
    lmsRoleMode: 'same_role' | 'multi_role';
    lmsSingleRole: 'student' | 'non_editing_teacher' | 'manager';
    lmsBulkSingleEmails: string;
    lmsStudentEmails: string;
    lmsTeacherEmails: string;
    lmsManagerEmails: string;
    lmsAutoSyncGit: boolean;
    loadedUserProfile: LoadedUserProfile | null;
    editFirstName: string;
    editLastName: string;
    editEmail: string;
    editDay: string;
    editMonth: string;
    editYear: string;
    editSchoolCode: string;
    editSchoolName: string;
    editPartnerCode: string;
    editPartnerName: string;
    gitActionType?: 'add' | 'remove'; // 🎯 HỖ TRỢ CẢ THÊM LẪN GỠ
    gitSelectedRepos: string[];
    gitUsersList: string;
    gitTargetRole: 'GUEST' | 'DEVELOPER' | 'ADMIN';
    kcTargetEmail: string;
    kcEnableResetPass: boolean;
    kcPasswordOption: 'email_lowercase' | 'custom' | 'default_secure';
    kcTempPass: string;
    kcForceChange: boolean;
    kcEnableVerify: boolean;
    kcVerifyAction: 'verify' | 'unverify';
    kcEnableStatus: boolean;
    kcStatusAction: 'enable' | 'disable';
    docUrl: string;
    assigneeEmail: string;
    feedbackCommentContent: string;
}

export const buildPreparedTaskPayload = (params: BuildPayloadParams): PreparedPayload | null => {
    let payload: Record<string, any> = {
        is_manual_dispatch: true,
        creator: 'Admin Studio',
        contact_info: params.contactInfo,
        additional_notes: params.additionalNotes,
    };

    let summary: PreparedTaskSummary = {
        engineName: '',
        actionTitle: '',
        targetEntity: '',
        detailsList: [],
    };

    let actualBotType: any = params.selectedBotType;

    if (params.selectedBotType === 'workspace_rpa') {
        summary.engineName = '🏢 Workspace RPA & LMS Pipeline';

        if (params.workspaceMainCategory === 'approve') {
            if (!params.selectedItemCode) {
                toast.error('Vui lòng click chọn 1 Đơn Hàng / Hợp Đồng trong danh sách kết quả lọc phía dưới!');
                return null;
            }

            if (params.approveSubFlow === 'approve_school_order') {
                const resolvedSchoolName = params.selectedCachedItem?.school_name || 'Tự động truy vết theo Order';
                const resolvedPartnerName = params.selectedCachedItem?.partner_name || 'Tự động truy vết';

                payload = {
                    ...payload,
                    action: 'approve_school_order_standalone',
                    order_code: params.selectedItemCode,
                    school_name: resolvedSchoolName,
                    partner_name: resolvedPartnerName,
                    courses: params.parsedOrderCourses.length > 0 ? params.parsedOrderCourses : undefined,
                };

                summary.actionTitle = 'Phê Duyệt Đơn Hàng Trường Học (School Order)';
                summary.targetEntity = `Mã Đơn: ${params.selectedItemCode}`;
                summary.detailsList = [
                    `Trường học: ${resolvedSchoolName}`,
                    `Đối tác quản lý: ${resolvedPartnerName}`,
                    `Số lượng môn học bóc tách: ${params.parsedOrderCourses.length} môn`,
                ];
            } else if (params.approveSubFlow === 'approve_partner_contract') {
                const resolvedPartnerName = params.selectedCachedItem?.partner_name || params.selectedCachedItem?.sender_name || undefined;
                const resolvedDistName = params.selectedCachedItem?.distributor_name || params.selectedCachedItem?.receiver_name || undefined;
                const resolvedDistCode = params.selectedCachedItem?.distributor_code;

                payload = {
                    ...payload,
                    action: 'approve_partner_contract_standalone',
                    contract_code: params.selectedItemCode,
                    partner_name: resolvedPartnerName,
                    distributor_name: resolvedDistName,
                    distributor_code: resolvedDistCode,
                    courses: params.parsedOrderCourses.length > 0 ? params.parsedOrderCourses : params.selectedCachedItem?.courses_data,
                };

                summary.actionTitle = 'Phê Duyệt Hợp Đồng Đối Tác (PRT Contract)';
                summary.targetEntity = `Mã Hợp Đồng: ${params.selectedItemCode}`;
                summary.detailsList = [
                    `Đối tác gửi: ${resolvedPartnerName || 'Tự động truy vết từ Két sắt'}`,
                    `Nhà phân phối nhận: ${resolvedDistName || 'Tự động truy vết từ Két sắt'}`,
                ];
            } else if (params.approveSubFlow === 'admin_approve_contract') {
                if (!params.adminJustification || params.adminJustification.trim().length < 15) {
                    toast.error('Lý do phê duyệt của Sales Admin bắt buộc phải có ít nhất 15 ký tự!');
                    return null;
                }

                const resolvedDistName = params.selectedCachedItem?.distributor_name || params.selectedCachedItem?.sender_name || 'Tự động truy vết';
                const resolvedDistCode = params.selectedCachedItem?.distributor_code;

                payload = {
                    ...payload,
                    action: 'admin_approve_contract',
                    contract_code: params.selectedItemCode,
                    distributor_name: resolvedDistName,
                    distributor_code: resolvedDistCode,
                    justification: params.adminJustification.trim(),
                    courses: params.parsedOrderCourses.length > 0 ? params.parsedOrderCourses : params.selectedCachedItem?.courses_data,
                };

                summary.actionTitle = 'Sales Admin Phê Duyệt Hợp Đồng Quản Trị (DST Contract)';
                summary.targetEntity = `Mã Hợp Đồng: ${params.selectedItemCode}`;
                summary.detailsList = [
                    `Nhà phân phối: ${resolvedDistName}`,
                    `Lý do phê duyệt: "${params.adminJustification.trim()}"`,
                ];
            }
        } else if (params.workspaceMainCategory === 'create_and_approve') {
            if (params.createApproveSubFlow === 'end_to_end') {
                if (!params.selectedSchool) {
                    toast.error('Vui lòng chọn trường học áp dụng từ danh sách!');
                    return null;
                }
                payload = {
                    ...payload,
                    action: 'pipeline_end_to_end',
                    school_name: params.selectedSchool.school_name,
                    hierarchy: {
                        school_name: params.selectedSchool.school_name,
                        school_code: params.selectedSchool.school_code,
                        partner_name: params.selectedSchool.partner_name,
                        distributor_name: params.selectedSchool.distributor_name,
                    },
                    order_details: {
                        contact_info: params.contactInfo,
                        additional_notes: params.additionalNotes,
                        courses: params.selectedCourses.map((c) => ({
                            category: c.category,
                            course_id: c.course_id,
                            course_name: c.course_name,
                            licenses: c.licenses,
                            start_date: c.start_date,
                            end_date: c.end_date,
                        })),
                    },
                    class_assignments: params.cofClassAssignments,
                    teachers_allocation: params.cofTeachersAllocation,
                    auto_sync_git: true,
                };

                summary.actionTitle = 'Chạy Toàn Trình Trọn Gói 4 Cấp (End-to-End Pipeline)';
                summary.targetEntity = params.selectedSchool.school_name;
                summary.detailsList = [
                    `Tuyến phả hệ: ${params.selectedSchool.full_lineage}`,
                    `Tổng số môn cấp phép: ${params.selectedCourses.length} môn`,
                ];
            } else if (params.createApproveSubFlow === 'partner_create_chain') {
                if (!params.selectedPartner) {
                    toast.error('Vui lòng chọn đối tác phụ trách!');
                    return null;
                }
                payload = {
                    ...payload,
                    action: 'partner_create_and_approve_chain',
                    partner_name: params.selectedPartner.name,
                    partner_code: params.selectedPartner.code,
                    contract_data: {
                        notes: params.additionalNotes,
                        courses: params.selectedCourses.map((c) => ({
                            category: c.category,
                            course_name: c.course_name,
                            licenses: c.licenses,
                        })),
                    },
                };

                summary.actionTitle = 'Tạo & Duyệt Chuỗi Đối Tác (Partner ➔ Distributor)';
                summary.targetEntity = params.selectedPartner.name;
                summary.detailsList = [`Đối tác: ${params.selectedPartner.name} (Mã: ${params.selectedPartner.code})`];
            } else if (params.createApproveSubFlow === 'distributor_create_chain') {
                if (!params.selectedDistributor) {
                    toast.error('Vui lòng chọn nhà phân phối!');
                    return null;
                }
                payload = {
                    ...payload,
                    action: 'distributor_create_and_approve_chain',
                    distributor_name: params.selectedDistributor.name,
                    distributor_code: params.selectedDistributor.code,
                    contract_data: {
                        notes: params.additionalNotes,
                        justification: params.adminJustification,
                        courses: params.selectedCourses.map((c) => ({
                            category: c.category,
                            course_name: c.course_name,
                            licenses: c.licenses,
                        })),
                    },
                };

                summary.actionTitle = 'Tạo & Duyệt Chuỗi Nhà Phân Phối (Distributor ➔ Sales Admin)';
                summary.targetEntity = params.selectedDistributor.name;
                summary.detailsList = [`Nhà phân phối: ${params.selectedDistributor.name} (Mã: ${params.selectedDistributor.code})`];
            }
        } else if (params.workspaceMainCategory === 'bulk_accounts') {
            if (!params.uploadedAccountsFile) {
                toast.error('Vui lòng chọn file Excel (.xlsx) chứa danh sách tài khoản!');
                return null;
            }
            if (!params.selectedSchool) {
                toast.error('Vui lòng chọn trường học áp dụng ở ô tìm kiếm phía trên!');
                return null;
            }

            payload = {
                ...payload,
                action: 'bulk_account_creation',
                school_name: params.selectedSchool.school_name,
                school_code: params.selectedSchool.school_code,
                partner_name: params.selectedSchool.partner_name,
                distributor_name: params.selectedSchool.distributor_name,
                filename: params.uploadedAccountsFile.name,
                file_size_kb: Math.round(params.uploadedAccountsFile.size / 1024),
                total_count: params.accountValidationStats.total || params.parsedAccountRows.length,
                student_count: params.accountValidationStats.students,
                teacher_count: params.accountValidationStats.teachers,
                has_validation_errors: params.accountValidationStats.errorCount > 0,
            };

            summary.actionTitle = `Tạo Hàng Loạt ${params.accountValidationStats.total || params.parsedAccountRows.length} Tài Khoản (${params.accountValidationStats.students} HS, ${params.accountValidationStats.teachers} GV)`;
            summary.targetEntity = params.selectedSchool.school_name;
            summary.detailsList = [
                `File tải lên: ${params.uploadedAccountsFile.name} (${Math.round(params.uploadedAccountsFile.size / 1024)} KB)`,
                `Trường thụ hưởng: ${params.selectedSchool.school_name} (Mã: ${params.selectedSchool.school_code})`,
                `Tuyến phả hệ: ${params.selectedSchool.partner_name} ➔ ${params.selectedSchool.distributor_name}`,
                `Trạng thái kiểm tra file: ${params.accountValidationStats.validCount} hợp lệ, ${params.accountValidationStats.errorCount} cần chú ý`,
            ];
        } else if (params.workspaceMainCategory === 'lms_enroll') {
            actualBotType = 'lms_playwright';

            if (params.lmsSelectedCourses.length === 0) {
                toast.error('Vui lòng chọn ít nhất 1 khóa học LMS!');
                return null;
            }

            if (params.lmsActionType === 'unenrol') {
                const unenrolList = params.lmsUnenrolEmails
                    .split(/[\n,;]+/)
                    .map((e) => e.trim())
                    .filter((e) => e.length > 0);

                if (unenrolList.length === 0) {
                    toast.error('Vui lòng nhập ít nhất 1 email cần hủy ghi danh khỏi khóa học!');
                    return null;
                }

                payload = {
                    action: 'unenrol_users_pipeline',
                    platform: 'learn.pythaverse.space',
                    courses: params.lmsSelectedCourses.map((c) => ({
                        course_id: c.course_id,
                        course_name: c.course_name,
                    })),
                    emails: unenrolList,
                };

                summary.engineName = '🗑️ PLearn Moodle LMS Batch Unenroller';
                summary.actionTitle = `Hủy Ghi Danh ${unenrolList.length} Học Viên Khỏi ${params.lmsSelectedCourses.length} Khóa Học`;
                summary.targetEntity = `${params.lmsSelectedCourses.length} Khóa học (${params.lmsSelectedCourses.map((c) => c.course_name).join(', ')})`;
                summary.detailsList = [
                    `Số lượng học viên cần xóa: ${unenrolList.length} tài khoản`,
                    `Danh sách khóa học áp dụng: ${params.lmsSelectedCourses.map((c) => `#${c.course_id}`).join(', ')}`,
                    `Hành động: Xóa vĩnh viễn quyền truy cập khóa học (Unenrol 🗑️)`,
                ];
            } else {
                let studentsList: string[] = [];
                let teachersList: string[] = [];
                let managersList: string[] = [];

                if (params.lmsRoleMode === 'same_role') {
                    const bulkEmails = params.lmsBulkSingleEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
                    if (params.lmsSingleRole === 'student') studentsList = bulkEmails;
                    else if (params.lmsSingleRole === 'non_editing_teacher') teachersList = bulkEmails;
                    else if (params.lmsSingleRole === 'manager') managersList = bulkEmails;
                } else {
                    studentsList = params.lmsStudentEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
                    teachersList = params.lmsTeacherEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
                    managersList = params.lmsManagerEmails.split('\n').map((e) => e.trim()).filter((e) => e.length > 0);
                }

                const totalEmails = studentsList.length + teachersList.length + managersList.length;
                if (totalEmails === 0) {
                    toast.error('Vui lòng nhập ít nhất một email cần ghi danh vào LMS!');
                    return null;
                }

                const gitSyncPlan: { repo_url: string; role: string; users: string[] }[] = [];
                if (params.lmsAutoSyncGit) {
                    params.lmsSelectedCourses.forEach((selCourse) => {
                        const fullCourse =
                            params.lmsCoursesList.find((c) => c.course_id === selCourse.course_id) ||
                            params.workspaceCoursesList.find((c) => c.course_id === selCourse.course_id);
                        if (fullCourse && (fullCourse as any).git_repos) {
                            let rawRepos: any[] = (fullCourse as any).git_repos;
                            if (typeof rawRepos === 'string') {
                                try {
                                    rawRepos = JSON.parse(rawRepos);
                                } catch {
                                    rawRepos = [];
                                }
                            }
                            if (Array.isArray(rawRepos)) {
                                rawRepos.forEach((r) => {
                                    if (r && r.repo_url) {
                                        const cleanUrl = r.repo_url.trim();
                                        const isTeacherOnly = r.target === 'teacher_only';
                                        const targetUsers = isTeacherOnly
                                            ? [...teachersList, ...managersList]
                                            : [...studentsList, ...teachersList, ...managersList];

                                        if (targetUsers.length > 0) {
                                            const existingEntry = gitSyncPlan.find((p) => p.repo_url === cleanUrl);
                                            if (existingEntry) {
                                                existingEntry.users = Array.from(new Set([...existingEntry.users, ...targetUsers]));
                                            } else {
                                                gitSyncPlan.push({
                                                    repo_url: cleanUrl,
                                                    role: 'GUEST',
                                                    users: Array.from(new Set(targetUsers)),
                                                });
                                            }
                                        }
                                    }
                                });
                            }
                        }
                    });
                }

                payload = {
                    action: 'direct_moodle_lms_enroll',
                    platform: 'learn.pythaverse.space',
                    courses: params.lmsSelectedCourses.map((c) => ({
                        category: c.category,
                        course_id: c.course_id,
                        course_name: c.course_name,
                        start_date: c.start_date,
                        end_date: c.end_date,
                        group_name: (c.group_name || '').trim() || undefined,
                    })),
                    role_mode: params.lmsRoleMode,
                    student_emails: studentsList,
                    teacher_emails: teachersList,
                    manager_emails: managersList,
                    auto_renew_existing: true,
                    auto_update_roles: true,
                    sync_git_repos: params.lmsAutoSyncGit && gitSyncPlan.length > 0,
                    git_sync_plan: gitSyncPlan,
                };

                summary.engineName = '🎓 PLearn Moodle LMS Batch Direct Enroller';
                summary.actionTitle = `Ghi Danh & Đổi Quyền Cho ${params.lmsSelectedCourses.length} Khóa Học (Single-Session)`;
                summary.targetEntity = `${params.lmsSelectedCourses.length} Khóa học (${params.lmsSelectedCourses.map((c) => c.course_name).join(', ')})`;
                summary.detailsList = [
                    `Tổng số tài khoản: ${totalEmails} người dùng`,
                    `Số lượng môn học thực thi: ${params.lmsSelectedCourses.length} môn (Không cần logout)`,
                    `Tự động cập nhật Role & Gia hạn: Có kích hoạt`,
                ];
            }
        } else if (params.workspaceMainCategory === 'update_user') {
            if (!params.loadedUserProfile) {
                toast.error('Vui lòng tìm kiếm và nạp thông tin người dùng trước!');
                return null;
            }
            if (!params.editFirstName.trim() || !params.editLastName.trim()) {
                toast.error('First Name và Last Name không được để trống!');
                return null;
            }
            if (!params.editSchoolCode) {
                toast.error('Vui lòng chọn Trường học cho người dùng!');
                return null;
            }

            payload = {
                ...payload,
                action: 'update_user_profile',
                user_id: params.loadedUserProfile.userId,
                user_login: params.loadedUserProfile.userLogin,
                first_name: params.editFirstName.trim(),
                last_name: params.editLastName.trim(),
                email: params.editEmail.trim(),
                day: params.editDay,
                month: params.editMonth,
                year: params.editYear,
                country_id: params.loadedUserProfile.countryId,
                city_id: params.loadedUserProfile.cityId,
                school_id: params.editSchoolCode,
                school_name: params.editSchoolName,
                partner_id: params.editPartnerCode,
                partner_name: params.editPartnerName,
                id_user_md: params.loadedUserProfile.idUserMD,
                user_role: params.loadedUserProfile.userRole,
            };

            summary.engineName = '🏢 Workspace User Profile Engine';
            summary.actionTitle = `Cập Nhật Hồ Sơ: ${params.editLastName} ${params.editFirstName} (#${params.loadedUserProfile.userId})`;
            summary.targetEntity = `${params.loadedUserProfile.userLogin} (${params.editEmail})`;
            summary.detailsList = [
                `Vai trò: ${params.loadedUserProfile.userRole === 'student' ? 'Học sinh (Student)' : 'Giáo viên (Teacher)'}`,
                `Ngày sinh: ${params.editDay}/${params.editMonth}/${params.editYear}`,
                `Trường học: ${params.editSchoolName} (Mã: ${params.editSchoolCode})`,
                `Đối tác quản lý: ${params.editPartnerName} (Mã: ${params.editPartnerCode})`,
                `Moodle User ID: ${params.loadedUserProfile.idUserMD || 'Chưa liên kết'}`,
            ];
        }
    } else if (params.selectedBotType === 'git_collaborator') {
        const validRepos = params.gitSelectedRepos.map((r) => r.trim()).filter((r) => r.length > 0);
        if (validRepos.length === 0) {
            toast.error('Vui lòng chọn ít nhất 1 Repository trên git.pythaverse.space!');
            return null;
        }

        const usersArr = params.gitUsersList
            .split(/[\n,;]+/)
            .map((u) => u.trim())
            .filter((u) => u.length > 0);

        if (usersArr.length === 0) {
            toast.error('Vui lòng nhập ít nhất 1 username hoặc email!');
            return null;
        }

        // 🎯 PHÂN LUỒNG: GỠ BỎ (REMOVE) vs THÊM MỚI (ADD)
        if (params.gitActionType === 'remove') {
            payload = {
                action: 'remove_repo_collaborators',
                git_action: 'remove',
                repo_urls: validRepos,
                users: usersArr,
            };

            summary.engineName = '🐙 Pythaverse Git (Single-Session Multi-Repo RPA)';
            summary.actionTitle = `Gỡ Bỏ ${usersArr.length} Thành Viên Khỏi ${validRepos.length} Repositories`;
            summary.targetEntity = `${validRepos.length} Repos (${validRepos.map((r) => r.split('/').pop()).join(', ')})`;
            summary.detailsList = [
                `Danh sách kho: ${validRepos.map((r) => r.split('/').pop()).join(', ')}`,
                `Hành động: GỠ BỎ QUYỀN (Remove Collaborators 🗑️)`,
                `Số lượng tài khoản cần gỡ: ${usersArr.length} người dùng`,
            ];
        } else {
            payload = {
                action: 'add_repo_collaborators',
                git_action: 'add',
                repo_urls: validRepos,
                role: params.gitTargetRole,
                users: usersArr,
            };

            summary.engineName = '🐙 Pythaverse Git (Single-Session Multi-Repo RPA)';
            summary.actionTitle = `Thêm ${usersArr.length} Thành Viên Vào ${validRepos.length} Repositories`;
            summary.targetEntity = `${validRepos.length} Repos (${validRepos.map((r) => r.split('/').pop()).join(', ')})`;
            summary.detailsList = [
                `Danh sách kho: ${validRepos.map((r) => r.split('/').pop()).join(', ')}`,
                `Vai trò gán: ${params.gitTargetRole} (Single login session)`,
                `Số lượng tài khoản: ${usersArr.length} người dùng`,
            ];
        }
    } else if (params.selectedBotType === 'keycloak_api') {
        const rawEmails = params.kcTargetEmail
            .split(/[\n,;]+/)
            .map((e) => e.trim())
            .filter((e) => e.length > 0);

        if (rawEmails.length === 0) {
            toast.error('Vui lòng nhập ít nhất 1 email hoặc username cần xử lý!');
            return null;
        }

        const actions: string[] = [];
        const conf: Record<string, any> = {
            identifiers: rawEmails,
            target_email: rawEmails[0],
        };
        const details: string[] = [];

        if (params.kcEnableResetPass) {
            actions.push('reset_password');
            conf.password_option = params.kcPasswordOption;
            conf.force_change_on_first_login = params.kcForceChange;

            if (params.kcPasswordOption === 'email_lowercase') {
                details.push('Đặt lại pass: Sử dụng chính EMAIL tài khoản (viết thường)');
            } else {
                const finalPass = params.kcTempPass.trim() || 'Pythaverse@2026';
                conf.custom_password = finalPass;
                details.push(`Đặt lại pass: "${finalPass}"`);
            }
            details.push(`Bắt buộc đổi mật khẩu khi đăng nhập: ${params.kcForceChange ? 'Có' : 'Không'}`);
        }
        if (params.kcEnableVerify) {
            actions.push(params.kcVerifyAction === 'verify' ? 'mark_email_verified' : 'mark_email_unverified');
            details.push(`Xác thực Email: ${params.kcVerifyAction === 'verify' ? 'Đã xác thực (TRUE)' : 'Gỡ xác thực (FALSE)'}`);
        }
        if (params.kcEnableStatus) {
            actions.push(params.kcStatusAction === 'enable' ? 'enable_account' : 'disable_account');
            details.push(`Trạng thái: ${params.kcStatusAction === 'enable' ? 'Kích hoạt (Enabled)' : 'Vô hiệu hóa (Disabled)'}`);
        }

        conf.actions = actions.length > 0 ? actions : ['noop_preview'];
        payload = conf;

        summary.engineName = '🔑 Keycloak IDP Management Bot';
        summary.actionTitle = `Quản Trị Danh Tính & Mật Khẩu (${rawEmails.length} Người Dùng)`;
        summary.targetEntity =
            rawEmails.length === 1 ? rawEmails[0] : `${rawEmails[0]} (+${rawEmails.length - 1} tài khoản khác)`;
        summary.detailsList = details.length > 0 ? details : ['Chưa chọn hành động can thiệp nào'];
    } else if (params.selectedBotType === 'feedback_doc_triage') {
        if (!params.docUrl) {
            toast.error('Vui lòng nhập đường dẫn Google Doc cần xử lý!');
            return null;
        }
        payload = {
            action: 'comment_and_assign',
            doc_url: params.docUrl,
            assignee_email: params.assigneeEmail,
            comment_content: params.feedbackCommentContent,
            row_index: 1,
        };

        summary.engineName = '🤖 Feedback Sheet & Google Doc Triage';
        summary.actionTitle = 'Đọc Tài Liệu & @Mention Giao Việc Tự Động';
        summary.targetEntity = params.docUrl;
        summary.detailsList = [
            `Gán nhân sự: ${params.assigneeEmail}`,
            `Nội dung tag: "${params.feedbackCommentContent.slice(0, 50)}..."`,
        ];
    }

    return {
        bot_type: actualBotType,
        payload_data: payload,
        summary,
    };
};