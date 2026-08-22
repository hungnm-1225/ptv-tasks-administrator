// frontend/src/features/board/WorkBoardPage.tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Trello,
    Plus,
    Search,
    RefreshCw,
    Calendar,
    CheckSquare,
    Clock,
    User,
    AlertCircle,
    X,
    Check,
    Trash2,
    Edit3,
    Loader2,
    ChevronRight,
    ChevronLeft,
    Flame,
    Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { BoardCard, BoardSubtask } from '../../types';

interface ColumnDef {
    id: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
    title: string;
    color: string;
    badgeBg: string;
}

const COLUMNS: ColumnDef[] = [
    { id: 'backlog', title: 'Backlog / Tiếp Nhận', color: 'border-slate-400', badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300' },
    { id: 'todo', title: 'To Do / Cần Làm', color: 'border-sky-400', badgeBg: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
    { id: 'in_progress', title: 'In Progress / Đang Làm', color: 'border-violet-500', badgeBg: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
    { id: 'review', title: 'Review / Chờ Duyệt Bot', color: 'border-amber-400', badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
    { id: 'done', title: 'Done / Hoàn Thành', color: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
];

export const WorkBoardPage: React.FC = () => {
    const [cards, setCards] = useState<BoardCard[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterCategory, setFilterCategory] = useState<string>('all');

    // Drag & Drop State
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

    // Modal State
    const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
    const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);

    // Quick Add State
    const [quickAddColumn, setQuickAddColumn] = useState<string | null>(null);
    const [quickAddTitle, setQuickAddTitle] = useState<string>('');

    // Subtask Input State inside Modal
    const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>('');

    // 1. Tải danh sách cards
    const loadCards = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await fetchApi<BoardCard[]>('/board/cards');
            setCards(data);
        } catch (err: any) {
            toast.error('Lỗi khi tải bảng công việc: ' + (err.message || err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadCards();
    }, [loadCards]);

    // 2. Lọc Cards
    const filteredCards = useMemo(() => {
        return cards.filter(card => {
            const q = searchQuery.toLowerCase().trim();
            const matchSearch = !q ||
                card.title.toLowerCase().includes(q) ||
                (card.description && card.description.toLowerCase().includes(q)) ||
                (card.assigned_name && card.assigned_name.toLowerCase().includes(q));

            const matchPriority = filterPriority === 'all' || card.priority === filterPriority;
            const matchCat = filterCategory === 'all' || card.category === filterCategory;

            return matchSearch && matchPriority && matchCat;
        });
    }, [cards, searchQuery, filterPriority, filterCategory]);

    // 3. Xử lý Drag & Drop
    const handleDragStart = (cardId: string) => {
        setDraggedCardId(cardId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (targetColumn: BoardCard['column_status']) => {
        if (!draggedCardId) return;

        const targetCard = cards.find(c => c.id === draggedCardId);
        if (!targetCard || targetCard.column_status === targetColumn) {
            setDraggedCardId(null);
            return;
        }

        // Cập nhật Optimistic UI
        setCards(prev => prev.map(c => c.id === draggedCardId ? { ...c, column_status: targetColumn } : c));
        setDraggedCardId(null);

        try {
            await fetchApi(`/board/cards/${draggedCardId}/move`, {
                method: 'PUT',
                body: JSON.stringify({ column_status: targetColumn })
            });
            toast.success(`Đã chuyển sang cột [${COLUMNS.find(c => c.id === targetColumn)?.title}]`);
        } catch (err: any) {
            toast.error('Không thể di chuyển thẻ: ' + (err.message || err));
            loadCards();
        }
    };

    // 4. Di chuyển thẻ bằng nút bấm nhanh
    const handleQuickMove = async (card: BoardCard, direction: 'left' | 'right') => {
        const colIdx = COLUMNS.findIndex(c => c.id === card.column_status);
        const newIdx = direction === 'left' ? colIdx - 1 : colIdx + 1;
        if (newIdx < 0 || newIdx >= COLUMNS.length) return;

        const newCol = COLUMNS[newIdx].id;
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, column_status: newCol } : c));

        try {
            await fetchApi(`/board/cards/${card.id}/move`, {
                method: 'PUT',
                body: JSON.stringify({ column_status: newCol })
            });
            toast.success(`Đã chuyển sang ${COLUMNS[newIdx].title}`);
        } catch (err: any) {
            loadCards();
        }
    };

    // 5. Thêm nhanh Card trên từng Cột
    const handleQuickAdd = async (columnId: any) => {
        if (!quickAddTitle.trim()) {
            setQuickAddColumn(null);
            return;
        }

        try {
            const res: any = await fetchApi('/board/cards', {
                method: 'POST',
                body: JSON.stringify({
                    title: quickAddTitle.trim(),
                    column_status: columnId,
                    priority: 'normal',
                    category: 'other',
                    assigned_name: 'Hùng Nguyễn Mạnh'
                })
            });

            toast.success('Đã tạo thẻ mới thành công!');
            setCards(prev => [res.data, ...prev]);
            setQuickAddTitle('');
            setQuickAddColumn(null);
        } catch (err: any) {
            toast.error('Lỗi khi tạo thẻ: ' + (err.message || err));
        }
    };

    // 6. Mở Modal Chi Tiết Card
    const handleOpenDetail = (card: BoardCard) => {
        setActiveCard({ ...card, subtasks: card.subtasks || [] });
        setIsEditing(false);
        setIsDetailModalOpen(true);
    };

    // 7. Lưu chỉnh sửa Card
    const handleSaveCardDetail = async () => {
        if (!activeCard) return;

        setIsSaving(true);
        try {
            const res: any = await fetchApi(`/board/cards/${activeCard.id}`, {
                method: 'PUT',
                body: JSON.stringify(activeCard)
            });
            toast.success('Đã cập nhật thông tin thẻ!');
            setCards(prev => prev.map(c => c.id === activeCard.id ? res.data : c));
            setIsDetailModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu thẻ: ' + (err.message || err));
        } finally {
            setIsSaving(false);
        }
    };

    // 8. Thêm Subtask trong Modal
    const handleAddSubtask = () => {
        if (!newSubtaskTitle.trim() || !activeCard) return;
        const newSub: BoardSubtask = {
            id: Date.now().toString(),
            title: newSubtaskTitle.trim(),
            completed: false
        };
        setActiveCard({
            ...activeCard,
            subtasks: [...(activeCard.subtasks || []), newSub]
        });
        setNewSubtaskTitle('');
    };

    // 9. Toggle Subtask hoàn thành
    const handleToggleSubtask = (subId: string) => {
        if (!activeCard) return;
        const updated = (activeCard.subtasks || []).map(s =>
            s.id === subId ? { ...s, completed: !s.completed } : s
        );
        setActiveCard({ ...activeCard, subtasks: updated });
    };

    // 10. Xóa Card
    const handleDeleteCard = async (cardId: string) => {
        if (!window.confirm('Anh có chắc chắn muốn xóa thẻ công việc này không?')) return;

        try {
            await fetchApi(`/board/cards/${cardId}`, { method: 'DELETE' });
            toast.success('Đã xóa thẻ.');
            setCards(prev => prev.filter(c => c.id !== cardId));
            setIsDetailModalOpen(false);
        } catch (err: any) {
            toast.error('Không thể xóa: ' + (err.message || err));
        }
    };

    return (
        <div className="space-y-5 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
                        <Trello className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                        Work Board (Kanban Hub)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Theo dõi, phân luồng và điều phối tiến độ công việc theo thời gian thực phong cách Jira & Trello.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={loadCards}
                        disabled={isLoading}
                        className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-50 shadow-xs transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Toolbar: Search & Filters */}
            <div className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm theo tiêu đề, nội dung, người phụ trách..."
                        className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-violet-500/40"
                    />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Lọc Priority */}
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none"
                    >
                        <option value="all">⚡ Tất cả mức độ</option>
                        <option value="urgent">🔥 Khẩn cấp (Urgent)</option>
                        <option value="high">⚡ Cao (High)</option>
                        <option value="normal">🌿 Bình thường (Normal)</option>
                        <option value="low">☕ Thấp (Low)</option>
                    </select>

                    {/* Lọc Category */}
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 outline-none"
                    >
                        <option value="all">🏷️ Tất cả danh mục</option>
                        <option value="bug">🐛 System Bug</option>
                        <option value="account_keycloak">🔑 Keycloak Account</option>
                        <option value="lms_enroll">🎓 LMS Enroll</option>
                        <option value="license">📜 License</option>
                        <option value="other">📌 Khác</option>
                    </select>
                </div>
            </div>

            {/* Kanban Board Columns Container */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 items-start overflow-x-auto pb-4">
                {COLUMNS.map(col => {
                    const colCards = filteredCards.filter(c => c.column_status === col.id);

                    return (
                        <div
                            key={col.id}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(col.id)}
                            className="bg-slate-100/70 dark:bg-slate-900/50 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-[calc(100vh-250px)] min-h-[450px]"
                        >
                            {/* Cột Header */}
                            <div className="flex items-center justify-between mb-3 px-1">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${col.badgeBg}`}>
                                        {colCards.length}
                                    </span>
                                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                                        {col.title}
                                    </h3>
                                </div>

                                <button
                                    onClick={() => {
                                        setQuickAddColumn(col.id);
                                        setQuickAddTitle('');
                                    }}
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 rounded-lg transition-colors"
                                    title="Thêm nhanh thẻ"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Ô Thêm Nhanh (Inline Quick Add) */}
                            {quickAddColumn === col.id && (
                                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-violet-400 shadow-md mb-3 animate-in fade-in">
                                    <textarea
                                        rows={2}
                                        autoFocus
                                        value={quickAddTitle}
                                        onChange={(e) => setQuickAddTitle(e.target.value)}
                                        placeholder="Nhập tiêu đề thẻ công việc..."
                                        className="w-full p-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg outline-none text-slate-800 dark:text-slate-200"
                                    />
                                    <div className="flex items-center justify-end gap-1.5 mt-2">
                                        <button
                                            onClick={() => setQuickAddColumn(null)}
                                            className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={() => handleQuickAdd(col.id)}
                                            className="px-3 py-1 bg-violet-600 text-white rounded-lg text-[11px] font-semibold hover:bg-violet-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Danh Sách Thẻ (Cards List) */}
                            <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                                {colCards.length === 0 && quickAddColumn !== col.id && (
                                    <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                        Kéo thả thẻ vào đây
                                    </div>
                                )}

                                {colCards.map(card => {
                                    const subtasks = card.subtasks || [];
                                    const completedSubtasks = subtasks.filter(s => s.completed).length;

                                    return (
                                        <div
                                            key={card.id}
                                            draggable
                                            onDragStart={() => handleDragStart(card.id)}
                                            onClick={() => handleOpenDetail(card)}
                                            className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-700/80 shadow-xs hover:shadow-md hover:border-violet-300 dark:hover:border-violet-600 transition-all cursor-grab active:cursor-grabbing group relative"
                                        >
                                            {/* Priority & Category Badges */}
                                            <div className="flex items-center justify-between gap-1.5 mb-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${card.priority === 'urgent' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' :
                                                        card.priority === 'high' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' :
                                                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                                    }`}>
                                                    {card.priority === 'urgent' && '🔥 '}
                                                    {card.priority}
                                                </span>

                                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-800">
                                                    {card.category}
                                                </span>
                                            </div>

                                            {/* Tiêu đề */}
                                            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 mb-2">
                                                {card.title}
                                            </h4>

                                            {/* Subtasks Progress */}
                                            {subtasks.length > 0 && (
                                                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-2.5">
                                                    <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                                                    <span>{completedSubtasks}/{subtasks.length} subtasks</span>
                                                    <div className="flex-1 bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                        <div
                                                            className="bg-violet-500 h-full rounded-full transition-all"
                                                            style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Footer: Due Date & Assignee */}
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px] text-slate-400">
                                                <div className="flex items-center gap-1">
                                                    {card.due_date ? (
                                                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                                                            <Calendar className="w-3 h-3 text-slate-400" />
                                                            {card.due_date}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-slate-400">
                                                            <User className="w-3 h-3" />
                                                            {card.assigned_name || 'Admin'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Nút dịch chuyển nhanh (Quick move) */}
                                                <div
                                                    className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        onClick={() => handleQuickMove(card, 'left')}
                                                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700"
                                                        title="Chuyển sang cột trái"
                                                    >
                                                        <ChevronLeft className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleQuickMove(card, 'right')}
                                                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-slate-700"
                                                        title="Chuyển sang cột phải"
                                                    >
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ==================================================================== */}
            {/* MODAL CHI TIẾT & CHỈNH SỬA CARD                                      */}
            {/* ==================================================================== */}
            {isDetailModalOpen && activeCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 relative max-h-[90vh] flex flex-col text-xs">
                        <button
                            onClick={() => setIsDetailModalOpen(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-3">
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${activeCard.priority === 'urgent' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'
                                }`}>
                                {activeCard.priority}
                            </span>
                            <span className="font-mono text-slate-400">ID: #{activeCard.id.slice(0, 8)}</span>
                        </div>

                        {/* Tiêu đề */}
                        <input
                            type="text"
                            value={activeCard.title}
                            onChange={(e) => setActiveCard({ ...activeCard, title: e.target.value })}
                            className="text-base font-bold text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-violet-500 outline-none pb-1 mb-4"
                        />

                        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                            {/* Thuộc tính cơ bản (Grid 2 cột) */}
                            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Trạng thái Cột</label>
                                    <select
                                        value={activeCard.column_status}
                                        onChange={(e) => setActiveCard({ ...activeCard, column_status: e.target.value as any })}
                                        className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-semibold text-violet-600"
                                    >
                                        {COLUMNS.map(c => (
                                            <option key={c.id} value={c.id}>{c.title}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Mức độ ưu tiên</label>
                                    <select
                                        value={activeCard.priority}
                                        onChange={(e) => setActiveCard({ ...activeCard, priority: e.target.value as any })}
                                        className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none font-semibold"
                                    >
                                        <option value="urgent">🔥 Khẩn cấp (Urgent)</option>
                                        <option value="high">⚡ Cao (High)</option>
                                        <option value="normal">🌿 Bình thường (Normal)</option>
                                        <option value="low">☕ Thấp (Low)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Người phụ trách</label>
                                    <input
                                        type="text"
                                        value={activeCard.assigned_name || ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, assigned_name: e.target.value })}
                                        placeholder="Họ và tên..."
                                        className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hạn chót (Due Date)</label>
                                    <input
                                        type="date"
                                        value={activeCard.due_date || ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, due_date: e.target.value })}
                                        className="w-full p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none"
                                    />
                                </div>
                            </div>

                            {/* Mô tả chi tiết */}
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Mô tả công việc</label>
                                <textarea
                                    rows={3}
                                    value={activeCard.description || ''}
                                    onChange={(e) => setActiveCard({ ...activeCard, description: e.target.value })}
                                    placeholder="Ghi chú chi tiết, hướng dẫn xử lý..."
                                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-violet-500/40"
                                />
                            </div>

                            {/* Danh Sách Subtasks Checklist */}
                            <div>
                                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                                    <span>Danh sách công việc con (Checklist)</span>
                                    <span className="text-[11px] text-slate-400 font-normal">
                                        {(activeCard.subtasks || []).filter(s => s.completed).length}/{(activeCard.subtasks || []).length} hoàn thành
                                    </span>
                                </label>

                                <div className="space-y-1.5 mb-2">
                                    {(activeCard.subtasks || []).map(sub => (
                                        <div
                                            key={sub.id}
                                            className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-800"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={sub.completed}
                                                onChange={() => handleToggleSubtask(sub.id)}
                                                className="rounded text-violet-600 focus:ring-violet-500 cursor-pointer"
                                            />
                                            <span className={`flex-1 ${sub.completed ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {sub.title}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const updated = (activeCard.subtasks || []).filter(s => s.id !== sub.id);
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                                className="text-slate-400 hover:text-rose-500"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newSubtaskTitle}
                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask()}
                                        placeholder="Thêm đầu việc mới..."
                                        className="flex-1 p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddSubtask}
                                        className="px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl hover:bg-slate-200"
                                    >
                                        Thêm
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={() => handleDeleteCard(activeCard.id)}
                                className="flex items-center gap-1 text-rose-500 hover:text-rose-700 text-xs font-semibold"
                            >
                                <Trash2 className="w-4 h-4" />
                                Xóa Thẻ
                            </button>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsDetailModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="button"
                                    disabled={isSaving}
                                    onClick={handleSaveCardDetail}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-semibold shadow-xs transition-all"
                                >
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                    Lưu Thay Đổi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};