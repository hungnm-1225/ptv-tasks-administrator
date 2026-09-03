// frontend/src/features/courses/CoursesManagerPage.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
    GraduationCap,
    Layers,
    Search,
    Plus,
    ExternalLink,
    Edit3,
    Trash2,
    FolderCheck,
    RefreshCw,
    Loader2,
    X,
    Check,
    BookOpen,
    FileSpreadsheet,
    Settings2,
    ArrowRightLeft,
    UploadCloud,
    FileText,
    Copy,
    Tag,
    AlertCircle,
    AlertTriangle,
    Globe,
    Download,
    FolderOpen,
    Pencil,
    CheckCircle2,
    GitBranch,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { CourseItem, GitRepoConfig } from '../../types';

type CoursePaneType = 'workspace' | 'lms';
type BulkInputMode = 'file' | 'text';
type GitRepoTargetType = 'teacher_only' | 'all' | 'student_only';

interface ParsedImportItem {
    course_id: number;
    category: string;
    course_name: string;
    sku?: string | null;
    lms_url: string;
    git_repos?: GitRepoConfig[];
    isValid: boolean;
    error?: string;
}

export const CoursesManagerPage: React.FC = () => {
    const [activePane, setActivePane] = useState<CoursePaneType>('workspace');

    const [courses, setCourses] = useState<CourseItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [copiedSku, setCopiedSku] = useState<string | null>(null);

    // Modal Thêm / Sửa
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
    const [deleteModalCourse, setDeleteModalCourse] = useState<CourseItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Form State Course
    const [formCourseId, setFormCourseId] = useState<string>('');
    const [formCategory, setFormCategory] = useState<string>('');
    const [formCourseName, setFormCourseName] = useState<string>('');
    const [formSku, setFormSku] = useState<string>('');
    const [formLmsUrl, setFormLmsUrl] = useState<string>('');
    // 🐙 Danh sách nhiều Repos trong Form
    const [formGitRepos, setFormGitRepos] = useState<GitRepoConfig[]>([]);
    const [formError, setFormError] = useState<string | null>(null);

    // Modal Bulk Import
    const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
    const [bulkMode, setBulkMode] = useState<BulkInputMode>('file');
    const [bulkRawText, setBulkRawText] = useState<string>('');
    const [uploadedFileName, setUploadedFileName] = useState<string>('');
    const [bulkPreview, setBulkPreview] = useState<ParsedImportItem[]>([]);
    const [isBulking, setIsBulking] = useState<boolean>(false);
    const [isDragOver, setIsDragOver] = useState<boolean>(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Modal Category Manager
    const [isCatModalOpen, setIsCatModalOpen] = useState<boolean>(false);
    const [editingCatOld, setEditingCatOld] = useState<string | null>(null);
    const [editingCatNew, setEditingCatNew] = useState<string>('');
    const [isCatSubmitting, setIsCatSubmitting] = useState<boolean>(false);

    // Modal Merge & Delete Category
    const [mergeModalCat, setMergeModalCat] = useState<{ cat: string; count: number } | null>(null);
    const [targetMergeCat, setTargetMergeCat] = useState<string>('');

    // ⚡ TẢI TRỰC TIẾP TỪ API
    const loadData = useCallback(async (forceSpinner = false) => {
        if (forceSpinner) {
            setIsLoading(true);
        }

        try {
            const [coursesData, catsData] = await Promise.all([
                fetchApi<CourseItem[]>(`/courses/${activePane}`),
                fetchApi<string[]>(`/courses/${activePane}/categories`),
            ]);
            setCourses(coursesData);
            setCategories(catsData);
        } catch (err: any) {
            toast.error('Lỗi khi tải dữ liệu khóa học: ' + (err.message || err));
        } finally {
            setIsLoading(false);
        }
    }, [activePane]);

    useEffect(() => {
        setSelectedCategory('all');
        setSearchQuery('');
        loadData();
    }, [loadData]);

    const handleTabChange = (pane: CoursePaneType) => {
        if (activePane === pane) return;
        setActivePane(pane);
    };

    const handleCopySku = (sku: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!sku || sku === '---') return;
        navigator.clipboard.writeText(sku);
        setCopiedSku(sku);
        toast.success(`Đã sao chép SKU: ${sku}`);
        setTimeout(() => setCopiedSku(null), 2000);
    };

    const filteredCourses = useMemo(() => {
        return courses.filter((item) => {
            const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const reposText = (item.git_repos || []).map((r) => r.repo_url).join(' ').toLowerCase();

            const matchSearch =
                !q ||
                item.course_name.toLowerCase().includes(q) ||
                item.course_id.toString().includes(q) ||
                (item.sku && item.sku.toLowerCase().includes(q)) ||
                reposText.includes(q) ||
                item.category.toLowerCase().includes(q);

            return matchCat && matchSearch;
        });
    }, [courses, selectedCategory, searchQuery]);

    const handleCourseIdChange = (val: string) => {
        setFormCourseId(val);
        if (val.trim() && !isNaN(Number(val.trim()))) {
            setFormLmsUrl(`https://learn.pythaverse.space/course/view.php?id=${val.trim()}`);
        }
    };

    const handleOpenModal = (course?: CourseItem) => {
        setFormError(null);
        if (course) {
            setEditingCourse(course);
            setFormCourseId(course.course_id.toString());
            setFormCategory(course.category);
            setFormCourseName(course.course_name);
            setFormSku(course.sku || '');
            setFormLmsUrl(course.lms_url || `https://learn.pythaverse.space/course/view.php?id=${course.course_id}`);
            setFormGitRepos(Array.isArray(course.git_repos) ? [...course.git_repos] : []);
        } else {
            setEditingCourse(null);
            setFormCourseId('');
            setFormCategory(selectedCategory !== 'all' ? selectedCategory : categories[0] || 'SWRP');
            setFormCourseName('');
            setFormSku('');
            setFormLmsUrl('');
            setFormGitRepos([]);
        }
        setIsModalOpen(true);
    };

    // Thao tác mảng Repos trong Form
    const handleAddRepoRow = () => {
        setFormGitRepos([...formGitRepos, { repo_url: '', target: 'teacher_only' }]);
    };

    const handleRemoveRepoRow = (idx: number) => {
        setFormGitRepos(formGitRepos.filter((_, i) => i !== idx));
    };

    const handleUpdateRepoRow = (idx: number, field: keyof GitRepoConfig, value: string) => {
        const updated = [...formGitRepos];
        updated[idx] = { ...updated[idx], [field]: value };
        setFormGitRepos(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formCourseId || !formCategory || !formCourseName) {
            setFormError('Vui lòng điền đầy đủ các trường bắt buộc!');
            return;
        }

        const cId = parseInt(formCourseId, 10);
        if (isNaN(cId) || cId <= 0) {
            setFormError('Course ID phải là số nguyên dương hợp lệ.');
            return;
        }

        const finalUrl = formLmsUrl.trim() || `https://learn.pythaverse.space/course/view.php?id=${cId}`;
        const cleanRepos = formGitRepos
            .map((r) => ({ repo_url: r.repo_url.trim(), target: r.target }))
            .filter((r) => r.repo_url.length > 0);

        setIsSubmitting(true);
        const payload = {
            course_id: cId,
            category: formCategory.trim().toUpperCase(),
            course_name: formCourseName.trim(),
            sku: formSku.trim() || null,
            lms_url: finalUrl,
            git_repos: cleanRepos,
        };

        try {
            if (editingCourse) {
                await fetchApi(`/courses/${activePane}/${editingCourse.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
                toast.success(`Đã cập nhật khóa học #${payload.course_id} thành công!`);
            } else {
                await fetchApi(`/courses/${activePane}`, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                toast.success(`Đã thêm mới khóa học #${payload.course_id} thành công!`);
            }
            setIsModalOpen(false);
            loadData(true);
        } catch (err: any) {
            setFormError(err.message || 'Thao tác thất bại');
            toast.error('Lỗi: ' + (err.message || err));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteModalCourse) return;

        try {
            await fetchApi(`/courses/${activePane}/${deleteModalCourse.id}`, { method: 'DELETE' });
            toast.success(`Đã xóa khóa học #${deleteModalCourse.course_id}`);
            setCourses((prev) => prev.filter((c) => c.id !== deleteModalCourse.id));
            setDeleteModalCourse(null);
        } catch (err: any) {
            toast.error('Không thể xóa: ' + (err.message || err));
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadedFileName(file.name);
        const reader = new FileReader();

        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                if (!rawRows || rawRows.length === 0) {
                    toast.warning('File không có dữ liệu.');
                    return;
                }

                const parsedList: ParsedImportItem[] = [];
                let startIdx = 0;
                const firstRowStr = (rawRows[0] || []).join(' ').toLowerCase();
                if (firstRowStr.includes('id') || firstRowStr.includes('course') || firstRowStr.includes('danh mục')) {
                    startIdx = 1;
                }

                for (let i = startIdx; i < rawRows.length; i++) {
                    const row = rawRows[i];
                    if (!row || row.length === 0) continue;

                    const cIdRaw = String(row[0] || '').trim().replace('#', '');
                    const cId = parseInt(cIdRaw, 10);
                    const cat = String(row[1] || 'SWRP').trim().toUpperCase();
                    const name = String(row[2] || '').trim();
                    const sku = row[3] ? String(row[3]).trim() : null;
                    let url = row[4] ? String(row[4]).trim() : '';
                    const gitReposRaw = row[5] ? String(row[5]).trim() : '';

                    if (!url && !isNaN(cId)) {
                        url = `https://learn.pythaverse.space/course/view.php?id=${cId}`;
                    }

                    const reposList: GitRepoConfig[] = [];
                    if (gitReposRaw) {
                        gitReposRaw.split(';').forEach((rPart) => {
                            const trimmed = rPart.trim();
                            if (trimmed) {
                                reposList.push({
                                    repo_url: trimmed,
                                    target: trimmed.toLowerCase().includes('teacher') ? 'teacher_only' : 'all',
                                });
                            }
                        });
                    }

                    const isValid = !isNaN(cId) && cId > 0 && name.length > 0 && cat.length > 0;
                    let error = '';
                    if (isNaN(cId) || cId <= 0) error = 'Course ID không hợp lệ';
                    else if (!cat) error = 'Thiếu danh mục';
                    else if (!name) error = 'Thiếu tên môn học';

                    parsedList.push({
                        course_id: cId || 0,
                        category: cat,
                        course_name: name,
                        sku: sku,
                        lms_url: url,
                        git_repos: reposList,
                        isValid,
                        error: error || undefined,
                    });
                }

                setBulkPreview(parsedList);
                const validCount = parsedList.filter((p) => p.isValid).length;
                if (validCount > 0) {
                    toast.success(`Đã đọc thành công ${validCount} khóa học hợp lệ từ "${file.name}"!`);
                } else {
                    toast.warning('Không tìm thấy dòng dữ liệu khóa học hợp lệ trong file.');
                }
            } catch (error: any) {
                toast.error('Lỗi khi đọc file Excel/CSV: ' + (error.message || error));
            }
        };

        reader.readAsBinaryString(file);
    };

    const handleParseBulkText = (text: string) => {
        setBulkRawText(text);
        if (!text.trim()) {
            setBulkPreview([]);
            return;
        }

        const lines = text.trim().split(/\r?\n/);
        const parsedList: ParsedImportItem[] = [];

        lines.forEach((line, index) => {
            if (index === 0 && (line.toLowerCase().includes('course id') || line.toLowerCase().includes('mã id'))) {
                return;
            }

            let parts: string[] = [];
            if (line.includes('\t')) {
                parts = line.split('\t');
            } else if (line.includes('|')) {
                parts = line.split('|');
            } else if (line.includes(',')) {
                parts = line.split(',');
            } else {
                parts = line.split(/\s{2,}/);
            }

            parts = parts.map((p) => p.trim());

            if (parts.length >= 3) {
                const cIdRaw = parts[0]?.replace(/\D/g, '');
                const cId = parseInt(cIdRaw, 10);
                const cat = parts[1]?.toUpperCase() || 'SWRP';
                const name = parts[2] || '';
                const sku = parts[3] || null;
                let url = parts[4] || '';
                const gitReposRaw = parts[5] || '';

                if (!url && !isNaN(cId)) {
                    url = `https://learn.pythaverse.space/course/view.php?id=${cId}`;
                }

                const reposList: GitRepoConfig[] = [];
                if (gitReposRaw) {
                    gitReposRaw.split(';').forEach((rPart) => {
                        const trimmed = rPart.trim();
                        if (trimmed) {
                            reposList.push({
                                repo_url: trimmed,
                                target: trimmed.toLowerCase().includes('teacher') ? 'teacher_only' : 'all',
                            });
                        }
                    });
                }

                const isValid = !isNaN(cId) && cId > 0 && name.length > 0 && cat.length > 0;
                let error = '';
                if (isNaN(cId) || cId <= 0) error = 'Course ID không hợp lệ';
                else if (!cat) error = 'Thiếu danh mục';
                else if (!name) error = 'Thiếu tên môn học';

                parsedList.push({
                    course_id: cId || 0,
                    category: cat,
                    course_name: name,
                    sku: sku,
                    lms_url: url,
                    git_repos: reposList,
                    isValid,
                    error: error || undefined,
                });
            }
        });

        setBulkPreview(parsedList);
    };

    const loadSampleBulkData = () => {
        const sample = `654\tSWRP\tSWRP 9: LEANBOT Programming Applications with IoT [V2] (EN)\tPTV-SWRP-09\thttps://learn.pythaverse.space/course/view.php?id=654\thttps://git.pythaverse.space/ptvswrp/SWRP11_Teacher;https://git.pythaverse.space/ptvswrp/SWRP11_Student
780\tASP\tASP Elementary Intermediate (EN)\tPTV-ASP-EL-01\thttps://learn.pythaverse.space/course/view.php?id=780\t
812\tIR\tInternational Robothon 2026 Strategy Guide (EN)\tPTV-IR-2026\thttps://learn.pythaverse.space/course/view.php?id=812\thttps://git.pythaverse.space/ptvir/IR2026_All
940\tOther\tAdvanced Digital Twin Simulation with Pythaverse Virtual Engine (EN)\tPTV-OTH-DT\thttps://learn.pythaverse.space/course/view.php?id=940\t`;
        setBulkRawText(sample);
        handleParseBulkText(sample);
        toast.info('Đã nạp 4 khóa học mẫu (hỗ trợ nhiều Git Repos cách nhau bằng dấu chấm phẩy) để xem trước!');
    };

    const handleExecuteBulkUpsert = async () => {
        const validOnes = bulkPreview.filter((item) => item.isValid);
        if (validOnes.length === 0) {
            toast.warning('Chưa có dòng dữ liệu hợp lệ nào để đồng bộ.');
            return;
        }

        setIsBulking(true);
        try {
            const res: any = await fetchApi(`/courses/${activePane}/bulk-upsert`, {
                method: 'POST',
                body: JSON.stringify({ courses: validOnes }),
            });
            toast.success(res.message || `Đã đồng bộ ${validOnes.length} khóa học thành công!`);
            setIsBulkModalOpen(false);
            setBulkRawText('');
            setUploadedFileName('');
            setBulkPreview([]);
            loadData(true);
        } catch (err: any) {
            toast.error('Lỗi khi đồng bộ hàng loạt: ' + (err.message || err));
        } finally {
            setIsBulking(false);
        }
    };

    const handleRenameCategory = async (oldCat: string) => {
        if (!editingCatNew.trim() || editingCatNew.trim().toUpperCase() === oldCat) {
            setEditingCatOld(null);
            return;
        }

        setIsCatSubmitting(true);
        try {
            await fetchApi(`/courses/${activePane}/categories/rename`, {
                method: 'PUT',
                body: JSON.stringify({
                    old_category: oldCat,
                    new_category: editingCatNew.trim().toUpperCase(),
                }),
            });
            toast.success(`Đã đổi tên danh mục "${oldCat}" thành "${editingCatNew.trim().toUpperCase()}"!`);
            setEditingCatOld(null);
            setEditingCatNew('');
            loadData(true);
        } catch (err: any) {
            toast.error('Đổi tên danh mục thất bại: ' + (err.message || err));
        } finally {
            setIsCatSubmitting(false);
        }
    };

    const handleDeleteCategory = (cat: string) => {
        const count = courses.filter((c) => c.category === cat).length;
        const remainingCats = categories.filter((c) => c !== cat);
        setTargetMergeCat(remainingCats[0] || 'SWRP');
        setMergeModalCat({ cat, count });
    };

    const handleConfirmMergeCategory = async () => {
        if (!mergeModalCat || !targetMergeCat.trim()) return;

        setIsCatSubmitting(true);
        try {
            await fetchApi(
                `/courses/${activePane}/categories/${mergeModalCat.cat}?target_category=${encodeURIComponent(
                    targetMergeCat.trim().toUpperCase()
                )}`,
                {
                    method: 'DELETE',
                }
            );
            toast.success(`Đã gộp danh mục "${mergeModalCat.cat}" vào "${targetMergeCat.trim().toUpperCase()}" thành công!`);
            setMergeModalCat(null);
            loadData(true);
        } catch (err: any) {
            toast.error('Lỗi khi gộp danh mục: ' + (err.message || err));
        } finally {
            setIsCatSubmitting(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
            {/* 1. Top Header Deck & Source Switcher */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-6 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                        <BookOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-sans">
                            Quản Lý Danh Mục Khóa Học & Git Repos
                        </h1>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium max-w-3xl leading-relaxed">
                        Tra cứu, đồng bộ cấu hình khóa học và quản trị liên kết đa Git Repository (1 Khóa Học ➔ Nhiều Repos).
                    </p>
                </div>

                {/* Source Switcher Pill Container */}
                <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-700/60 self-start lg:self-auto shadow-2xs shrink-0">
                    <button
                        onClick={() => handleTabChange('workspace')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${activePane === 'workspace'
                            ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-800'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                    >
                        <div className="w-2 h-2 rounded-full bg-indigo-600"></div>
                        <span>Workspace Courses (Order/License)</span>
                    </button>

                    <button
                        onClick={() => handleTabChange('lms')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${activePane === 'lms'
                            ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs border border-indigo-200 dark:border-indigo-800'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                    >
                        <Globe className="w-3.5 h-3.5 text-slate-500" />
                        <span>LMS Learn Portal (learn.pythaverse.space)</span>
                    </button>
                </div>
            </div>

            {/* 2. Action & Search Control Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 sm:p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm theo tên môn học, Course ID, SKU, Git Repo URL, danh mục..."
                            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-2xs"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 cursor-pointer"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => loadData(true)}
                        disabled={isLoading}
                        title="Làm mới danh sách"
                        className="p-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all shadow-2xs shrink-0 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                    <button
                        onClick={() => setIsCatModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                        <Settings2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>Quản Lý Category</span>
                    </button>

                    <button
                        onClick={() => {
                            setIsBulkModalOpen(true);
                            setBulkPreview([]);
                            setBulkRawText('');
                            setUploadedFileName('');
                        }}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                        <FileSpreadsheet className="w-4 h-4" />
                        <span>Nhập Excel (Bulk)</span>
                    </button>

                    <button
                        onClick={() => handleOpenModal()}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Thêm Khóa Học</span>
                    </button>
                </div>
            </div>

            {/* 3. Category Filter Chips Rail */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium shrink-0 pr-1">
                    <Tag className="w-3.5 h-3.5" />
                    <span>Danh mục:</span>
                </div>

                <button
                    onClick={() => setSelectedCategory('all')}
                    className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${selectedCategory === 'all'
                        ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-400/30'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
                        }`}
                >
                    Tất cả ({courses.length})
                </button>

                {categories.map((catName) => {
                    const count = courses.filter((c) => c.category === catName).length;
                    const isSelected = selectedCategory === catName;
                    return (
                        <button
                            key={catName}
                            onClick={() => setSelectedCategory(catName)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${isSelected
                                ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-400/30'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800'
                                }`}
                        >
                            {catName} ({count})
                        </button>
                    );
                })}
            </div>

            {/* 4. Bento Grid Course Cards */}
            <div>
                {isLoading && courses.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => (
                            <div
                                key={i}
                                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 animate-pulse shadow-xs space-y-3"
                            >
                                <div className="flex justify-between items-center">
                                    <div className="w-16 h-5 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
                                    <div className="w-14 h-4 bg-slate-200 dark:bg-slate-800 rounded-md"></div>
                                </div>
                                <div className="w-4/5 h-5 bg-slate-200 dark:bg-slate-800 rounded"></div>
                                <div className="w-24 h-4 bg-slate-100 dark:bg-slate-800 rounded"></div>
                            </div>
                        ))}
                    </div>
                ) : filteredCourses.length === 0 ? (
                    <div className="w-full flex flex-col items-center justify-center text-center py-16 px-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs my-2">
                        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-slate-700/60 flex items-center justify-center mb-4">
                            <FolderOpen className="w-7 h-7" />
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                            Không tìm thấy khóa học nào phù hợp
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
                            Hãy thử thay đổi từ khóa tìm kiếm hoặc bấm nút bên dưới để tạo mới khóa học.
                        </p>
                        <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer border border-slate-200 dark:border-slate-700"
                                >
                                    Xóa tìm kiếm
                                </button>
                            )}
                            <button
                                onClick={() => handleOpenModal()}
                                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>Thêm Khóa Học Mới</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredCourses.map((course) => {
                            const lmsUrl =
                                course.lms_url || `https://learn.pythaverse.space/course/view.php?id=${course.course_id}`;
                            const gitRepos = Array.isArray(course.git_repos) ? course.git_repos : [];

                            return (
                                <div
                                    key={`${activePane}-${course.id || course.course_id}`}
                                    id={`course-card-${course.course_id}`}
                                    className="group bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                                >
                                    <div>
                                        {/* Top Row: Category Tag & ID */}
                                        <div className="flex items-center justify-between gap-2 mb-2.5">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40">
                                                {course.category}
                                            </span>

                                            <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500">
                                                ID: #{course.course_id}
                                            </span>
                                        </div>

                                        {/* Course Title */}
                                        <h3 className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors leading-snug line-clamp-2 min-h-[42px]">
                                            {course.course_name}
                                        </h3>

                                        {/* SKU Row */}
                                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                            <span className="text-slate-400">SKU:</span>
                                            {course.sku ? (
                                                <button
                                                    onClick={(e) => handleCopySku(course.sku || '', e)}
                                                    title="Click để sao chép SKU"
                                                    className="font-mono font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                                >
                                                    <span>{course.sku}</span>
                                                    {copiedSku === course.sku ? (
                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                    ) : (
                                                        <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100 transition-opacity" />
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="text-slate-400 font-mono">---</span>
                                            )}
                                        </div>

                                        {/* 🐙 Multi Git Repos Badge Rail */}
                                        {gitRepos.length > 0 && (
                                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                {gitRepos.map((repo, rIdx) => {
                                                    const shortName = repo.repo_url ? repo.repo_url.split('/').pop() || 'Repo' : 'Repo';
                                                    const targetText =
                                                        repo.target === 'teacher_only'
                                                            ? 'Chỉ GV'
                                                            : repo.target === 'student_only'
                                                                ? 'Chỉ HS'
                                                                : 'Cả GV & HS';

                                                    return (
                                                        <a
                                                            key={rIdx}
                                                            href={repo.repo_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            title={`Mở Git Repo: ${repo.repo_url} (${targetText})`}
                                                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800/50 hover:bg-violet-100 transition-all max-w-[200px] truncate"
                                                        >
                                                            <GitBranch className="w-2.5 h-2.5 shrink-0 text-violet-600 dark:text-violet-400" />
                                                            <span className="truncate font-mono">{shortName}</span>
                                                            <span className="opacity-75 text-[9px]">({targetText})</span>
                                                        </a>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom Row: View on LMS Link & Action Icons */}
                                    <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                                        <a
                                            href={lmsUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold transition-colors"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Xem trên LMS</span>
                                        </a>

                                        <div className="flex items-center gap-1 text-slate-400">
                                            <button
                                                onClick={() => handleOpenModal(course)}
                                                title="Chỉnh sửa môn học"
                                                className="p-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all cursor-pointer"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteModalCourse(course)}
                                                title="Xóa môn học"
                                                className="p-1.5 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all cursor-pointer"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* MODAL 1: Quản Lý Danh Mục */}
            {/* ========================================================================= */}
            {isCatModalOpen && createPortal(
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsCatModalOpen(false);
                    }}
                    className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,580px)] shadow-2xl p-6 sm:p-7 relative my-auto"
                    >
                        <button
                            onClick={() => {
                                setIsCatModalOpen(false);
                                setEditingCatOld(null);
                            }}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-1.5">
                            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                                <Settings2 className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Quản Lý Danh Mục ({activePane.toUpperCase()})
                            </h2>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            Đổi tên danh mục sẽ tự động cập nhật tên mới cho toàn bộ các khóa học đang thuộc danh mục đó.
                        </p>

                        <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                            {categories.map((catName) => {
                                const count = courses.filter((c) => c.category === catName).length;
                                const isEditing = editingCatOld === catName;

                                return (
                                    <div
                                        key={catName}
                                        className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl transition-all"
                                    >
                                        {isEditing ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={editingCatNew}
                                                    onChange={(e) => setEditingCatNew(e.target.value)}
                                                    placeholder="Tên danh mục mới..."
                                                    className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-indigo-400 rounded-xl text-slate-900 dark:text-white focus:outline-none ring-2 ring-indigo-500/20 uppercase font-bold"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameCategory(catName);
                                                        if (e.key === 'Escape') setEditingCatOld(null);
                                                    }}
                                                />
                                                <button
                                                    disabled={isCatSubmitting}
                                                    onClick={() => handleRenameCategory(catName)}
                                                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs cursor-pointer shadow-xs"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingCatOld(null)}
                                                    className="p-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 rounded-xl text-xs cursor-pointer"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200">
                                                    <span className="font-bold text-slate-900 dark:text-white">{catName}</span> ({count} môn học)
                                                </span>

                                                <div className="flex items-center gap-1 text-slate-400">
                                                    <button
                                                        onClick={() => {
                                                            setEditingCatOld(catName);
                                                            setEditingCatNew(catName);
                                                        }}
                                                        title="Đổi tên danh mục"
                                                        className="p-1.5 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>

                                                    <button
                                                        onClick={() => handleDeleteCategory(catName)}
                                                        title="Xóa hoặc gộp danh mục"
                                                        className="p-1.5 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                                    >
                                                        <ArrowRightLeft className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-6 flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCatModalOpen(false);
                                    setEditingCatOld(null);
                                }}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                                Đóng
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ========================================================================= */}
            {/* MODAL GỘP & XÓA DANH MỤC */}
            {/* ========================================================================= */}
            {mergeModalCat && createPortal(
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !isCatSubmitting) setMergeModalCat(null);
                    }}
                    className="fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,520px)] shadow-2xl p-6 sm:p-7 relative my-auto space-y-4"
                    >
                        <button
                            disabled={isCatSubmitting}
                            onClick={() => setMergeModalCat(null)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-start gap-3.5">
                            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center shrink-0">
                                <ArrowRightLeft className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    Gộp & Xóa Danh Mục
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Chuyển toàn bộ các khóa học sang danh mục mới trước khi xóa.
                                </p>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-2xl space-y-2 text-xs">
                            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                                <span>Danh mục nguồn cần xóa:</span>
                                <span className="font-bold text-slate-900 dark:text-white uppercase font-mono px-2 py-0.5 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                                    {mergeModalCat.cat}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                                <span>Số lượng khóa học bị ảnh hưởng:</span>
                                <span className="font-bold text-amber-600 dark:text-amber-400">
                                    {mergeModalCat.count} khóa học
                                </span>
                            </div>
                        </div>

                        <div className="space-y-1.5 text-xs">
                            <label className="block font-semibold text-slate-700 dark:text-slate-300">
                                Chọn hoặc Nhập Danh Mục Đích Để Chuyển Tới: <span className="text-rose-500">*</span>
                            </label>
                            <div className="space-y-2">
                                <select
                                    value={targetMergeCat}
                                    onChange={(e) => setTargetMergeCat(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 uppercase"
                                >
                                    {categories
                                        .filter((c) => c !== mergeModalCat.cat)
                                        .map((c) => (
                                            <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                                Gộp vào danh mục: {c}
                                            </option>
                                        ))}
                                </select>

                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-slate-400">Hoặc tự nhập tên:</span>
                                    <input
                                        type="text"
                                        value={targetMergeCat}
                                        onChange={(e) => setTargetMergeCat(e.target.value.toUpperCase())}
                                        placeholder="VD: SWRP, IR, ROBOTICS..."
                                        className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white uppercase outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                disabled={isCatSubmitting}
                                onClick={() => setMergeModalCat(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer border border-slate-200 dark:border-slate-700"
                            >
                                Hủy Bỏ
                            </button>

                            <button
                                type="button"
                                disabled={isCatSubmitting || !targetMergeCat.trim()}
                                onClick={handleConfirmMergeCategory}
                                className="inline-flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                            >
                                {isCatSubmitting ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <ArrowRightLeft className="w-4 h-4" />
                                )}
                                <span>Xác Nhận Gộp & Xóa</span>
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: Nhập Nhanh Danh Sách Khóa Học (Bulk Import) */}
            {/* ========================================================================= */}
            {isBulkModalOpen && createPortal(
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsBulkModalOpen(false);
                    }}
                    className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,860px)] shadow-2xl p-6 sm:p-7 relative my-auto"
                    >
                        <button
                            onClick={() => setIsBulkModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-1.5">
                            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                                <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                Nhập Nhanh Danh Sách Khóa Học (Bulk) – {activePane.toUpperCase()}
                            </h2>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            Hệ thống sẽ tự động tạo URL LMS và hỗ trợ phân tách nhiều Git Repos qua dấu chấm phẩy (;).
                        </p>

                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-4 text-xs font-semibold">
                            <button
                                type="button"
                                onClick={() => setBulkMode('file')}
                                className={`flex items-center justify-center gap-2 py-2 rounded-xl transition-all cursor-pointer ${bulkMode === 'file'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold border border-slate-200/80 dark:border-slate-700'
                                    : 'text-slate-600 dark:text-slate-400'
                                    }`}
                            >
                                <UploadCloud className="w-4 h-4 text-emerald-600" />
                                <span>Tải Lên File (.xlsx, .xls, .csv)</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setBulkMode('text')}
                                className={`flex items-center justify-center gap-2 py-2 rounded-xl transition-all cursor-pointer ${bulkMode === 'text'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold border border-slate-200/80 dark:border-slate-700'
                                    : 'text-slate-600 dark:text-slate-400'
                                    }`}
                            >
                                <FileText className="w-4 h-4 text-indigo-600" />
                                <span>Dán Dữ Liệu (Copy-Paste)</span>
                            </button>
                        </div>

                        {bulkMode === 'file' ? (
                            <div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,.tsv,.txt,.xlsx,.xls"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />

                                <div
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDragOver(true);
                                    }}
                                    onDragLeave={() => setIsDragOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDragOver(false);
                                        const file = e.dataTransfer.files?.[0];
                                        if (file) {
                                            const pseudoEvent = { target: { files: [file] } } as any;
                                            handleFileUpload(pseudoEvent);
                                        }
                                    }}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${isDragOver
                                        ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                                        : 'border-slate-300 dark:border-slate-700 hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-800/30'
                                        }`}
                                >
                                    <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                                        <UploadCloud className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                        {uploadedFileName ? `Đã chọn: ${uploadedFileName}` : 'Bấm để chọn file Excel (.xlsx, .xls) hoặc CSV'}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                        Cột trong file:{' '}
                                        <span className="font-mono text-slate-600 dark:text-slate-300">
                                            Course ID | Category | Course Name | SKU | LMS URL | Danh sách Git Repos (cách nhau dấu ;)
                                        </span>
                                    </p>
                                </div>

                                <div className="mt-2 flex items-center justify-between text-xs">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            loadSampleBulkData();
                                        }}
                                        className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Nạp nhanh dữ liệu mẫu kiểm thử</span>
                                    </button>
                                    <span className="text-slate-400">Hỗ trợ định dạng UTF-8 CSV, TSV, XLSX</span>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <textarea
                                    rows={5}
                                    value={bulkRawText}
                                    onChange={(e) => handleParseBulkText(e.target.value)}
                                    placeholder={`Ví dụ:\n654\tSWRP\tSWRP 9: LEANBOT Programming\tPTV-SWRP-09\thttps://learn.pythaverse.space/course/view.php?id=654\thttps://git.pythaverse.space/ptvswrp/SWRP11_Teacher;https://git.pythaverse.space/ptvswrp/SWRP11_Student`}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-2xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 leading-relaxed"
                                />
                                <div className="mt-1.5 flex items-center justify-between text-xs">
                                    <button
                                        type="button"
                                        onClick={loadSampleBulkData}
                                        className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                                    >
                                        Nạp văn bản mẫu
                                    </button>
                                    <span className="text-slate-400">Phân tách bằng Tab (\t), Phẩy (,) hoặc Gạch đứng (|)</span>
                                </div>
                            </div>
                        )}

                        {/* Live Preview Container */}
                        <div className="mt-4">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
                                <span>Xem trước ({bulkPreview.filter((p) => p.isValid).length} khóa học hợp lệ):</span>
                                {bulkPreview.length > 0 && (
                                    <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">
                                        ✓ Đã tự động tạo Link LMS & Nhận diện Git Repos
                                    </span>
                                )}
                            </div>

                            {bulkPreview.length === 0 ? (
                                <div className="py-6 px-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 text-center text-xs text-slate-400">
                                    Chưa có dữ liệu xem trước. Hãy tải file hoặc dán nội dung.
                                </div>
                            ) : (
                                <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden max-h-[180px] overflow-y-auto scrollbar-thin">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 font-bold">
                                            <tr>
                                                <th className="p-2">ID</th>
                                                <th className="p-2">Category</th>
                                                <th className="p-2">Tên Môn Học</th>
                                                <th className="p-2">SKU</th>
                                                <th className="p-2">Số Lượng Git Repos</th>
                                                <th className="p-2 text-center">Trạng Thái</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {bulkPreview.map((item, idx) => (
                                                <tr
                                                    key={idx}
                                                    className={
                                                        item.isValid
                                                            ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                                            : 'bg-rose-50/40 dark:bg-rose-950/20'
                                                    }
                                                >
                                                    <td className="p-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                        #{item.course_id}
                                                    </td>
                                                    <td className="p-2">
                                                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold">
                                                            {item.category}
                                                        </span>
                                                    </td>
                                                    <td className="p-2 text-slate-800 dark:text-slate-200 truncate max-w-[160px] font-medium">
                                                        {item.course_name}
                                                    </td>
                                                    <td className="p-2 font-mono text-slate-500">{item.sku || '---'}</td>
                                                    <td className="p-2 font-mono text-violet-600 dark:text-violet-400 font-bold">
                                                        {item.git_repos && item.git_repos.length > 0 ? (
                                                            <span>🐙 {item.git_repos.length} repos</span>
                                                        ) : (
                                                            <span className="text-slate-400 font-normal">---</span>
                                                        )}
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        {item.isValid ? (
                                                            <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-bold">
                                                                <Check className="w-3 h-3" /> Hợp lệ
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className="inline-flex items-center gap-1 text-rose-600 text-[11px] font-bold"
                                                                title={item.error}
                                                            >
                                                                <AlertTriangle className="w-3 h-3" /> Lỗi
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsBulkModalOpen(false)}
                                className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                            >
                                Hủy
                            </button>

                            <button
                                type="button"
                                disabled={isBulking || bulkPreview.filter((p) => p.isValid).length === 0}
                                onClick={handleExecuteBulkUpsert}
                                className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                            >
                                {isBulking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span>Đồng Bộ {bulkPreview.filter((p) => p.isValid).length} Khóa Học Ngay</span>
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ========================================================================= */}
            {/* MODAL 3: Thêm / Chỉnh Sửa Khóa Học Đơn Lẻ (HỖ TRỢ THÊM NHIỀU REPOS ĐỘNG) */}
            {/* ========================================================================= */}
            {isModalOpen && createPortal(
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsModalOpen(false);
                    }}
                    className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,640px)] shadow-2xl p-6 sm:p-7 relative my-auto max-h-[92vh] overflow-y-auto scrollbar-thin"
                    >
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2.5 mb-5">
                            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                {editingCourse ? 'Chỉnh Sửa Khóa Học' : 'Thêm Khóa Học Mới'} ({activePane.toUpperCase()})
                            </h2>
                        </div>

                        {formError && (
                            <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-2xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Course ID (Mã ID LMS số) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    required
                                    disabled={!!editingCourse}
                                    value={formCourseId}
                                    onChange={(e) => handleCourseIdChange(e.target.value)}
                                    placeholder="VD: 654"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Category (Danh Mục) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formCategory}
                                    onChange={(e) => setFormCategory(e.target.value)}
                                    placeholder="VD: SWRP, IR, ASP..."
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 uppercase"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Tên Khóa Học <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formCourseName}
                                    onChange={(e) => setFormCourseName(e.target.value)}
                                    placeholder="VD: SWRP 9: LEANBOT Programming..."
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Mã SKU (Tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    value={formSku}
                                    onChange={(e) => setFormSku(e.target.value)}
                                    placeholder="VD: PTV-SWRP-09"
                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Đường dẫn LMS URL (Tự động tạo)
                                </label>
                                <input
                                    type="url"
                                    value={formLmsUrl}
                                    onChange={(e) => setFormLmsUrl(e.target.value)}
                                    placeholder="https://learn.pythaverse.space/course/view.php?id=..."
                                    className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-400 outline-none"
                                />
                            </div>

                            {/* 🐙 KHU VỰC CẤU HÌNH NHIỀU GIT REPOS (MULTI-REPO BUILDER) */}
                            <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/50 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-bold text-violet-800 dark:text-violet-300">
                                        <GitBranch className="w-4 h-4 text-violet-600" />
                                        <span>Cấu Hình Pythaverse Git Repositories ({formGitRepos.length} Repos)</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleAddRepoRow}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Thêm Repo Mới</span>
                                    </button>
                                </div>

                                {formGitRepos.length === 0 ? (
                                    <div className="p-4 rounded-xl border border-dashed border-violet-300 dark:border-violet-800/60 text-center text-xs text-violet-600/80 dark:text-violet-400/80 bg-white/50 dark:bg-slate-900/50">
                                        Khóa học này hiện chưa gắn Git Repo nào. Bấm <strong>"Thêm Repo Mới"</strong> nếu môn học có kèm mã nguồn thực hành.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {formGitRepos.map((repoItem, rIdx) => (
                                            <div
                                                key={rIdx}
                                                className="p-3 bg-white dark:bg-slate-900 border border-violet-200/80 dark:border-violet-800/60 rounded-xl space-y-2 relative"
                                            >
                                                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                                    <span>Repo #{rIdx + 1}:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRepoRow(rIdx)}
                                                        className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                                                        title="Xóa repo này"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                <div>
                                                    <input
                                                        type="url"
                                                        required
                                                        value={repoItem.repo_url}
                                                        onChange={(e) => handleUpdateRepoRow(rIdx, 'repo_url', e.target.value)}
                                                        placeholder="VD: https://git.pythaverse.space/ptvswrp/SWRP11_Teacher"
                                                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-900 dark:text-white focus:border-violet-500 outline-none"
                                                    />
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-semibold text-slate-500 shrink-0">Cấp cho:</span>
                                                    <div className="grid grid-cols-3 gap-1.5 flex-1">
                                                        {[
                                                            { id: 'teacher_only', label: 'Chỉ Giáo Viên' },
                                                            { id: 'all', label: 'Cả GV & HS' },
                                                            { id: 'student_only', label: 'Chỉ Học Sinh' },
                                                        ].map((opt) => (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => handleUpdateRepoRow(rIdx, 'target', opt.id)}
                                                                className={`py-1 px-1.5 text-center rounded-lg text-[11px] font-semibold transition cursor-pointer border ${repoItem.target === opt.id
                                                                    ? 'border-violet-600 bg-violet-600 text-white shadow-2xs font-bold'
                                                                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                                                                    }`}
                                                            >
                                                                {opt.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                                >
                                    Hủy
                                </button>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    <span>{editingCourse ? 'Cập Nhật Khóa Học' : 'Lưu Khóa Học'}</span>
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>,
                document.body
            )}

            {/* ========================================================================= */}
            {/* MODAL 4: Xác Nhận Xóa Khóa Học */}
            {/* ========================================================================= */}
            {deleteModalCourse && createPortal(
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setDeleteModalCourse(null);
                    }}
                    className="fixed inset-0 z-[9999] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        transition={{ duration: 0.2 }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,480px)] shadow-2xl p-6 relative my-auto"
                    >
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 mx-auto">
                            <AlertTriangle className="w-6 h-6" />
                        </div>

                        <h3 className="text-base font-bold text-center text-slate-900 dark:text-white">
                            Xác nhận xóa khóa học?
                        </h3>

                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2 leading-relaxed">
                            Bạn có chắc chắn muốn xóa khóa học{' '}
                            <strong className="text-slate-800 dark:text-slate-200">
                                #{deleteModalCourse.course_id} - {deleteModalCourse.course_name}
                            </strong>
                            ? Hành động này không thể hoàn tác.
                        </p>

                        <div className="mt-6 flex items-center justify-center gap-3">
                            <button
                                type="button"
                                onClick={() => setDeleteModalCourse(null)}
                                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                            >
                                Hủy bỏ
                            </button>

                            <button
                                type="button"
                                onClick={handleDelete}
                                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
                            >
                                Xác Nhận Xóa
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}
        </div>
    );
};