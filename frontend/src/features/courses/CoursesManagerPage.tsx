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
    BookOpen
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

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    // Form State
    const [formCourseId, setFormCourseId] = useState<string>('');
    const [formCategory, setFormCategory] = useState<string>('');
    const [formCourseName, setFormCourseName] = useState<string>('');
    const [formSku, setFormSku] = useState<string>('');
    const [formLmsUrl, setFormLmsUrl] = useState<string>('');

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

    // 2. Lọc theo Category & Search
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
            setFormLmsUrl(activePane === 'lms' ? 'https://learn.pythaverse.space/course/view.php?id=' : 'https://learn.pythaverse.space/course/view.php?id=');
        }
        setIsModalOpen(true);
    };

    // 4. Lưu Form (Thêm mới / Cập nhật)
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

    // 5. Xóa khóa học
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

                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadData}
                            disabled={isLoading}
                            title="Làm mới dữ liệu"
                            className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl text-slate-600 dark:text-slate-300 transition-colors"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>

                        <button
                            onClick={() => handleOpenModal()}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 active:scale-98 text-white text-xs font-semibold rounded-xl shadow-xs transition-all"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm Khóa Học Mới
                        </button>
                    </div>
                </div>

                {/* Thanh Category Chips (Duyệt theo Category phụ thuộc) */}
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

            {/* Danh Sách Khóa Học */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                    <span className="text-xs">Đang nạp danh mục khóa học từ Supabase...</span>
                </div>
            ) : filteredCourses.length === 0 ? (
                <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                    <p className="text-sm font-medium">Không tìm thấy khóa học nào phù hợp</p>
                    <p className="text-xs text-slate-500 mt-1">Hãy thử đổi danh mục hoặc từ khóa tìm kiếm</p>
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

            {/* Modal Thêm / Chỉnh Sửa Khóa Học */}
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