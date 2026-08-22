// frontend/src/features/courses/CoursesManagerPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    ArrowRightLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { CourseItem } from '../../types';

type CoursePaneType = 'workspace' | 'lms';

export const CoursesManagerPage: React.FC = () => {
    const [activePane, setActivePane] = useState<CoursePaneType>('workspace');
    const [courses, setCourses] = useState<CourseItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // --- Modal Thêm / Sửa Từng Khóa Học ---
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Form State Course
    const [formCourseId, setFormCourseId] = useState<string>('');
    const [formCategory, setFormCategory] = useState<string>('');
    const [formCourseName, setFormCourseName] = useState<string>('');
    const [formSku, setFormSku] = useState<string>('');
    const [formLmsUrl, setFormLmsUrl] = useState<string>('');

    // --- Modal Bulk Import (Copy-Paste từ Excel) ---
    const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);
    const [bulkRawText, setBulkRawText] = useState<string>('');
    const [bulkPreview, setBulkPreview] = useState<Array<{
        course_id: number;
        category: string;
        course_name: string;
        sku?: string | null;
        lms_url: string;
    }>>([]);
    const [isBulking, setIsBulking] = useState<boolean>(false);

    // --- Modal Quản Lý Danh Mục (Category Manager) ---
    const [isCatModalOpen, setIsCatModalOpen] = useState<boolean>(false);
    const [newCatName, setNewCatName] = useState<string>('');
    const [editingCatOld, setEditingCatOld] = useState<string | null>(null);
    const [editingCatNew, setEditingCatNew] = useState<string>('');
    const [isCatSubmitting, setIsCatSubmitting] = useState<boolean>(false);

    // 1. Tải danh mục & khóa học
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [coursesData, catsData] = await Promise.all([
                fetchApi<CourseItem[]>(`/courses/${activePane}`),
                fetchApi<string[]>(`/courses/${activePane}/categories`)
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

    // 2. Lọc danh sách hiển thị
    const filteredCourses = useMemo(() => {
        return courses.filter(item => {
            const matchCat = selectedCategory === 'all' || item.category === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchSearch = !q ||
                item.course_name.toLowerCase().includes(q) ||
                item.course_id.toString().includes(q) ||
                (item.sku && item.sku.toLowerCase().includes(q)) ||
                item.category.toLowerCase().includes(q);

            return matchCat && matchSearch;
        });
    }, [courses, selectedCategory, searchQuery]);

    // 3. Mở Modal Thêm / Sửa
    const handleOpenModal = (course?: CourseItem) => {
        if (course) {
            setEditingCourse(course);
            setFormCourseId(course.course_id.toString());
            setFormCategory(course.category);
            setFormCourseName(course.course_name);
            setFormSku(course.sku || '');
            setFormLmsUrl(course.lms_url);
        } else {
            setEditingCourse(null);
            setFormCourseId('');
            setFormCategory(selectedCategory !== 'all' ? selectedCategory : (categories[0] || 'SWRP'));
            setFormCourseName('');
            setFormSku('');
            setFormLmsUrl('https://learn.pythaverse.space/course/view.php?id=');
        }
        setIsModalOpen(true);
    };

    // 4. Lưu Form Khóa Học Đơn Lẻ
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formCourseId || !formCategory || !formCourseName || !formLmsUrl) {
            toast.warning('Vui lòng điền đầy đủ các trường bắt buộc!');
            return;
        }

        setIsSubmitting(true);
        const payload = {
            course_id: parseInt(formCourseId, 10),
            category: formCategory.trim().toUpperCase(),
            course_name: formCourseName.trim(),
            sku: formSku.trim() || null,
            lms_url: formLmsUrl.trim()
        };

        try {
            if (editingCourse) {
                await fetchApi(`/courses/${activePane}/${editingCourse.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                toast.success(`Đã cập nhật khóa học #${payload.course_id} thành công!`);
            } else {
                await fetchApi(`/courses/${activePane}`, {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });
                toast.success(`Đã thêm mới khóa học #${payload.course_id} thành công!`);
            }
            setIsModalOpen(false);
            loadData();
        } catch (err: any) {
            toast.error('Thao tác thất bại: ' + (err.message || err));
        } finally {
            setIsSubmitting(false);
        }
    };

    // 5. Xóa khóa học đơn lẻ
    const handleDelete = async (course: CourseItem) => {
        if (!window.confirm(`Anh có chắc chắn muốn xóa khóa học "${course.course_name}" (#${course.course_id}) khỏi danh mục không?`)) {
            return;
        }

        try {
            await fetchApi(`/courses/${activePane}/${course.id}`, { method: 'DELETE' });
            toast.success(`Đã xóa khóa học #${course.course_id}`);
            setCourses(prev => prev.filter(c => c.id !== course.id));
        } catch (err: any) {
            toast.error('Không thể xóa: ' + (err.message || err));
        }
    };

    // 6. Xử lý Parse text Excel sang mảng khóa học (Bulk Import)
    const handleParseBulkText = (text: string) => {
        setBulkRawText(text);
        if (!text.trim()) {
            setBulkPreview([]);
            return;
        }

        const lines = text.trim().split('\n');
        const parsedList: any[] = [];

        lines.forEach(line => {
            // Tách theo Tab (copy từ Excel) hoặc dấu phẩy / dấu gạch đứng |
            const parts = line.includes('\t')
                ? line.split('\t')
                : line.includes('|')
                    ? line.split('|')
                    : line.split(',');

            if (parts.length >= 3) {
                const cIdRaw = parts[0]?.trim().replace('#', '');
                const cId = parseInt(cIdRaw, 10);
                const cat = parts[1]?.trim().toUpperCase() || 'SWRP';
                const name = parts[2]?.trim() || '';
                const sku = parts[3]?.trim() || null;
                let url = parts[4]?.trim() || '';

                if (!url && !isNaN(cId)) {
                    url = `https://learn.pythaverse.space/course/view.php?id=${cId}`;
                }

                if (!isNaN(cId) && name) {
                    parsedList.push({
                        course_id: cId,
                        category: cat,
                        course_name: name,
                        sku: sku || null,
                        lms_url: url
                    });
                }
            }
        });

        setBulkPreview(parsedList);
    };

    // 7. Thực thi Lưu Bulk Import
    const handleExecuteBulkUpsert = async () => {
        if (bulkPreview.length === 0) {
            toast.warning('Chưa có dòng dữ liệu hợp lệ nào để đồng bộ.');
            return;
        }

        setIsBulking(true);
        try {
            const res: any = await fetchApi(`/courses/${activePane}/bulk-upsert`, {
                method: 'POST',
                body: JSON.stringify({ courses: bulkPreview })
            });
            toast.success(res.message || `Đã đồng bộ ${bulkPreview.length} khóa học thành công!`);
            setIsBulkModalOpen(false);
            setBulkRawText('');
            setBulkPreview([]);
            loadData();
        } catch (err: any) {
            toast.error('Lỗi khi đồng bộ hàng loạt: ' + (err.message || err));
        } finally {
            setIsBulking(false);
        }
    };

    // 8. Đổi tên Category
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
                    new_category: editingCatNew.trim().toUpperCase()
                })
            });
            toast.success(`Đã đổi tên danh mục "${oldCat}" thành "${editingCatNew.trim().toUpperCase()}"!`);
            setEditingCatOld(null);
            setEditingCatNew('');
            loadData();
        } catch (err: any) {
            toast.error('Đổi tên danh mục thất bại: ' + (err.message || err));
        } finally {
            setIsCatSubmitting(false);
        }
    };

    // 9. Xóa / Gộp Category
    const handleDeleteCategory = async (cat: string) => {
        const remainingCats = categories.filter(c => c !== cat);
        let promptMsg = `Anh muốn làm gì với các khóa học thuộc danh mục "${cat}"?\n\n- Bấm OK để GỘP sang danh mục khác\n- Bấm Cancel để hủy bỏ.`;

        if (window.confirm(promptMsg)) {
            const targetCat = window.prompt(`Nhập tên danh mục đích để gộp vào (${remainingCats.join(', ')}):`, remainingCats[0] || 'SWRP');
            if (!targetCat) return;

            setIsCatSubmitting(true);
            try {
                await fetchApi(`/courses/${activePane}/categories/${cat}?target_category=${encodeURIComponent(targetCat.trim().toUpperCase())}`, {
                    method: 'DELETE'
                });
                toast.success(`Đã gộp danh mục "${cat}" vào "${targetCat.toUpperCase()}"!`);
                loadData();
            } catch (err: any) {
                toast.error('Lỗi khi gộp danh mục: ' + (err.message || err));
            } finally {
                setIsCatSubmitting(false);
            }
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Pane Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
                        <BookOpen className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                        Quản Lý Danh Mục Khóa Học
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Tra cứu, đồng bộ và quản trị cấu hình khóa học hệ sinh thái Pythaverse.
                    </p>
                </div>

                {/* Tab-Pane Selector */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-xs">
                    <button
                        onClick={() => setActivePane('workspace')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activePane === 'workspace'
                            ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-300 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Workspace Courses (Order/License)
                    </button>
                    <button
                        onClick={() => setActivePane('lms')}
                        className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${activePane === 'lms'
                            ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                    >
                        <GraduationCap className="w-3.5 h-3.5" />
                        LMS Learn Portal (learn.pythaverse.space)
                    </button>
                </div>
            </div>

            {/* Action Toolbar */}
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs space-y-3.5">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                    {/* Ô Tìm Kiếm */}
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm theo tên môn học, Course ID, SKU, danh mục..."
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                        />
                    </div>

                    {/* Nhóm Nút Hành Động */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={loadData}
                            disabled={isLoading}
                            title="Làm mới dữ liệu"
                            className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-slate-600 dark:text-slate-300 transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>

                        {/* Nút Quản Lý Category */}
                        <button
                            onClick={() => setIsCatModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition-all"
                        >
                            <Settings2 className="w-4 h-4 text-violet-500" />
                            Quản Lý Category
                        </button>

                        {/* Nút Nhập Nhanh Bulk Import */}
                        <button
                            onClick={() => setIsBulkModalOpen(true)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs transition-all"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                            Nhập Nhanh Excel (Bulk)
                        </button>

                        {/* Nút Thêm Khóa Học Lẻ */}
                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm Khóa Học
                        </button>
                    </div>
                </div>

                {/* Thanh Category Chips (Lọc Category Phụ Thuộc) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                        <FolderCheck className="w-3.5 h-3.5" /> Danh mục:
                    </span>
                    <button
                        onClick={() => setSelectedCategory('all')}
                        className={`px-3 py-1 rounded-lg font-medium transition-all shrink-0 ${selectedCategory === 'all'
                            ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                    >
                        Tất cả ({courses.length})
                    </button>
                    {categories.map(cat => {
                        const count = courses.filter(c => c.category === cat).length;
                        return (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                className={`px-3 py-1 rounded-lg font-medium transition-all shrink-0 ${selectedCategory === cat
                                    ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 font-semibold shadow-2xs'
                                    : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                    }`}
                            >
                                {cat} ({count})
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Danh Sách Khóa Học Grid */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                    <span className="text-xs">Đang nạp danh mục khóa học từ Supabase...</span>
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-sm font-medium">Không tìm thấy khóa học nào phù hợp</p>
                    <p className="text-xs text-slate-500 mt-1">Hãy thử đổi danh mục hoặc bấm "Nhập Nhanh Excel" để nạp dữ liệu</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredCourses.map(course => (
                        <div
                            key={course.id}
                            className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs hover:border-violet-300 dark:hover:border-violet-600 transition-all flex flex-col justify-between group"
                        >
                            <div>
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                    <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                                        {course.category}
                                    </span>
                                    <span className="text-[11px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded">
                                        ID: #{course.course_id}
                                    </span>
                                </div>

                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                                    {course.course_name}
                                </h3>

                                {course.sku && (
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        SKU: <span className="font-mono text-slate-600 dark:text-slate-300">{course.sku}</span>
                                    </p>
                                )}
                            </div>

                            <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                                <a
                                    href={course.lms_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 hover:underline"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Xem trên LMS
                                </a>

                                <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleOpenModal(course)}
                                        className="p-1.5 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-slate-500 hover:text-violet-600 rounded-lg transition-colors"
                                        title="Chỉnh sửa khóa học"
                                    >
                                        <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(course)}
                                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-slate-500 hover:text-rose-600 rounded-lg transition-colors"
                                        title="Xóa khóa học"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 1: BULK IMPORT EXCEL (NHẬP NHANH HÀNG LOẠT)                   */}
            {/* ==================================================================== */}
            {isBulkModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative max-h-[90vh] flex flex-col">
                        <button
                            onClick={() => setIsBulkModalOpen(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                            Nhập Nhanh Danh Sách Khóa Học (Bulk Upsert) – {activePane.toUpperCase()}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                            Copy các dòng từ Excel hoặc Google Sheet rồi dán vào đây. Cấu trúc mỗi dòng: <br />
                            <code className="bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-violet-600 dark:text-violet-400">
                                Course ID [Tab] Category [Tab] Tên Khóa Học [Tab] SKU (tùy chọn) [Tab] LMS URL (tùy chọn)
                            </code>
                        </p>

                        <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                            <textarea
                                rows={5}
                                value={bulkRawText}
                                onChange={(e) => handleParseBulkText(e.target.value)}
                                placeholder={`Ví dụ:\n654\tSWRP\tSWRP 9: LEANBOT Programming\tPTV-SWRP-09\thttps://learn.pythaverse.space/course/view.php?id=654\n655\tIR\tIR 10: AI & Robotics Essentials\tPTV-IR-10\thttps://learn.pythaverse.space/course/view.php?id=655`}
                                className="w-full p-3 font-mono text-[11px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-emerald-500/40 outline-none"
                            />

                            {/* Bảng Xem Trước (Preview) */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <span>Xem trước ({bulkPreview.length} khóa học hợp lệ):</span>
                                    {bulkPreview.length > 0 && (
                                        <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">✓ Đã nhận diện cấu trúc</span>
                                    )}
                                </div>

                                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl text-xs">
                                    {bulkPreview.length === 0 ? (
                                        <div className="p-4 text-center text-slate-400 text-xs">Chưa có dữ liệu xem trước. Hãy dán nội dung vào ô trên.</div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-100 dark:bg-slate-900/80 sticky top-0 text-[11px] text-slate-500">
                                                <tr>
                                                    <th className="p-2">ID</th>
                                                    <th className="p-2">Category</th>
                                                    <th className="p-2">Tên Khóa Học</th>
                                                    <th className="p-2">SKU</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {bulkPreview.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/40 text-[11px]">
                                                        <td className="p-2 font-mono font-bold text-violet-600 dark:text-violet-400">#{item.course_id}</td>
                                                        <td className="p-2"><span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold">{item.category}</span></td>
                                                        <td className="p-2 font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">{item.course_name}</td>
                                                        <td className="p-2 font-mono text-slate-400">{item.sku || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-4 mt-3 border-t border-slate-100 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={() => setIsBulkModalOpen(false)}
                                className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium text-xs hover:bg-slate-200"
                            >
                                Hủy
                            </button>
                            <button
                                type="button"
                                disabled={isBulking || bulkPreview.length === 0}
                                onClick={handleExecuteBulkUpsert}
                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs transition-all disabled:opacity-50"
                            >
                                {isBulking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Đồng Bộ {bulkPreview.length} Khóa Học Ngay
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 2: QUẢN LÝ DANH MỤC CATEGORIES                                 */}
            {/* ==================================================================== */}
            {isCatModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative">
                        <button
                            onClick={() => setIsCatModalOpen(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-2">
                            <Settings2 className="w-5 h-5 text-violet-600" />
                            Quản Lý Danh Mục ({activePane.toUpperCase()})
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                            Đổi tên danh mục sẽ tự động cập nhật tên mới cho toàn bộ các khóa học đang thuộc danh mục đó.
                        </p>

                        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                            {categories.map(cat => {
                                const count = courses.filter(c => c.category === cat).length;
                                const isEditing = editingCatOld === cat;

                                return (
                                    <div
                                        key={cat}
                                        className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs"
                                    >
                                        {isEditing ? (
                                            <div className="flex items-center gap-2 flex-1 mr-2">
                                                <input
                                                    type="text"
                                                    value={editingCatNew}
                                                    onChange={(e) => setEditingCatNew(e.target.value)}
                                                    placeholder="Tên mới..."
                                                    className="flex-1 px-2 py-1 bg-white dark:bg-slate-800 border border-violet-400 rounded-lg text-xs outline-none uppercase font-bold"
                                                />
                                                <button
                                                    disabled={isCatSubmitting}
                                                    onClick={() => handleRenameCategory(cat)}
                                                    className="p-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                                                    title="Lưu đổi tên"
                                                >
                                                    <Check className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingCatOld(null)}
                                                    className="p-1 bg-slate-200 dark:bg-slate-700 text-slate-600 rounded-lg"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-slate-800 dark:text-slate-200">{cat}</span>
                                                <span className="text-[11px] text-slate-400">({count} môn học)</span>
                                            </div>
                                        )}

                                        {!isEditing && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => {
                                                        setEditingCatOld(cat);
                                                        setEditingCatNew(cat);
                                                    }}
                                                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition-colors"
                                                    title="Đổi tên danh mục"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCategory(cat)}
                                                    className="p-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg transition-colors"
                                                    title="Xóa hoặc gộp danh mục"
                                                >
                                                    <ArrowRightLeft className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setIsCatModalOpen(false)}
                                className="px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-semibold hover:bg-violet-700"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 3: THÊM / SỬA KHÓA HỌC ĐƠN LẺ                                  */}
            {/* ==================================================================== */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4">
                            <BookOpen className="w-5 h-5 text-violet-600" />
                            {editingCourse ? 'Chỉnh Sửa Khóa Học' : 'Thêm Khóa Học Mới'} ({activePane.toUpperCase()})
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Course ID (Mã ID LMS số) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    required
                                    disabled={!!editingCourse}
                                    value={formCourseId}
                                    onChange={(e) => setFormCourseId(e.target.value)}
                                    placeholder="VD: 654"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/40 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Category (Danh Mục) <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formCategory}
                                    onChange={(e) => setFormCategory(e.target.value)}
                                    placeholder="VD: SWRP, IR, ASP..."
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/40 outline-none uppercase"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Tên Khóa Học <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formCourseName}
                                    onChange={(e) => setFormCourseName(e.target.value)}
                                    placeholder="VD: SWRP 9: LEANBOT Programming..."
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/40 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Mã SKU (Tùy chọn)
                                </label>
                                <input
                                    type="text"
                                    value={formSku}
                                    onChange={(e) => setFormSku(e.target.value)}
                                    placeholder="VD: PTV-SWRP-09"
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/40 outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Đường dẫn LMS URL <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="url"
                                    required
                                    value={formLmsUrl}
                                    onChange={(e) => setFormLmsUrl(e.target.value)}
                                    placeholder="https://learn.pythaverse.space/course/view.php?id=..."
                                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/40 outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2.5 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-xs transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    {editingCourse ? 'Cập Nhật' : 'Lưu Khóa Học'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};