// frontend/src/features/board/WorkBoardPage.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Trello,
    Plus,
    Search,
    RefreshCw,
    Calendar,
    CheckSquare,
    Clock,
    User,
    X,
    Check,
    Trash2,
    Edit3,
    Loader2,
    ChevronRight,
    ChevronLeft,
    Settings2,
    Image as ImageIcon,
    Palette,
    Layers,
    FolderPlus,
    AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { BoardItem, BoardColumnItem, BoardCardItem, BoardSubtask } from '../../types';

const COLOR_PALETTE = [
    '#8b5cf6', // Violet
    '#38bdf8', // Sky Blue
    '#10b981', // Emerald
    '#fbbf24', // Amber
    '#f43f5e', // Rose
    '#ec4899', // Pink
    '#64748b', // Slate
    '#f97316', // Orange
];

const PRESET_WALLPAPERS = [
    { name: 'Default Dark', value: '', color: '#0f172a' },
    { name: 'Aurora Deep', value: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1600&q=80', color: '#0f172a' },
    { name: 'Cyber Neon', value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=80', color: '#0f172a' },
    { name: 'Minimal Mountain', value: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1600&q=80', color: '#0f172a' }
];

// --- 🎆 TỰ TẠO HIỆU ỨNG PHÁO HOA CONFETTI THUẦN TYPESCRIPT (KHÔNG CẦN CÀI THƯ VIỆN) ---
const triggerConfetti = () => {
    const canvas = document.createElement('canvas');
    canvas.className = 'fixed inset-0 pointer-events-none z-[9999]';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: any[] = [];
    const colors = ['#8b5cf6', '#38bdf8', '#10b981', '#fbbf24', '#f43f5e', '#ffffff'];

    for (let i = 0; i < 90; i++) {
        particles.push({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2 + 100,
            radius: Math.random() * 4 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: (Math.random() - 0.5) * 16,
            vy: (Math.random() - 0.7) * 18,
            alpha: 1
        });
    }

    let animationFrame: number;
    const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let alive = false;

        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.4; // Trọng lực
            p.alpha -= 0.015;

            if (p.alpha > 0) {
                alive = true;
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        if (alive) {
            animationFrame = requestAnimationFrame(render);
        } else {
            cancelAnimationFrame(animationFrame);
            document.body.removeChild(canvas);
        }
    };

    render();
};

export const WorkBoardPage: React.FC = () => {
    // Boards & Active Selection
    const [boards, setBoards] = useState<BoardItem[]>([]);
    const [activeBoardId, setActiveBoardId] = useState<string>('');
    const [columns, setColumns] = useState<BoardColumnItem[]>([]);
    const [cards, setCards] = useState<BoardCardItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterCategory, setFilterCategory] = useState<string>('all');

    // Drag & Drop
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

    // Modals
    const [isBoardModalOpen, setIsBoardModalOpen] = useState<boolean>(false);
    const [newBoardTitle, setNewBoardTitle] = useState<string>('');
    const [newBoardBg, setNewBoardBg] = useState<string>('');

    const [isBgSettingsOpen, setIsBgSettingsOpen] = useState<boolean>(false);

    const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
    const [editingColumn, setEditingColumn] = useState<BoardColumnItem | null>(null);
    const [columnFormTitle, setColumnFormTitle] = useState<string>('');
    const [columnFormColor, setColumnFormColor] = useState<string>('#8b5cf6');
    const [columnFormType, setColumnFormType] = useState<string>('custom');

    const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
    const [activeCard, setActiveCard] = useState<BoardCardItem | null>(null);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>('');
    const [isSavingCard, setIsSavingCard] = useState<boolean>(false);

    // Quick Add
    const [quickAddColId, setQuickAddColId] = useState<string | null>(null);
    const [quickAddTitle, setQuickAddTitle] = useState<string>('');

    const bgFileInputRef = useRef<HTMLInputElement>(null);

    // 1. Tải danh sách Boards
    const loadBoards = useCallback(async () => {
        try {
            const data = await fetchApi<BoardItem[]>('/board/boards');
            setBoards(data);
            if (data.length > 0 && !activeBoardId) {
                const defaultB = data.find(b => b.is_default) || data[0];
                setActiveBoardId(defaultB.id);
            }
        } catch (err: any) {
            toast.error('Lỗi nạp danh sách bảng: ' + (err.message || err));
        }
    }, [activeBoardId]);

    useEffect(() => {
        loadBoards();
    }, [loadBoards]);

    // 2. Tải Cột & Thẻ của Board đang chọn
    const loadBoardData = useCallback(async (boardId: string) => {
        if (!boardId) return;
        setIsLoading(true);
        try {
            const [colsData, cardsData] = await Promise.all([
                fetchApi<BoardColumnItem[]>(`/board/boards/${boardId}/columns`),
                fetchApi<BoardCardItem[]>(`/board/boards/${boardId}/cards`)
            ]);
            setColumns(colsData);
            setCards(cardsData);
        } catch (err: any) {
            toast.error('Lỗi tải dữ liệu bảng: ' + (err.message || err));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeBoardId) {
            loadBoardData(activeBoardId);
        }
    }, [activeBoardId, loadBoardData]);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);

    // 3. Lọc Cards
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

    // 4. Xử lý Drag & Drop + Pháo hoa
    const handleDragStart = (cardId: string) => setDraggedCardId(cardId);
    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

    const handleDrop = async (targetColumnId: string) => {
        if (!draggedCardId) return;
        const targetCard = cards.find(c => c.id === draggedCardId);
        if (!targetCard || targetCard.column_id === targetColumnId) {
            setDraggedCardId(null);
            return;
        }

        const targetCol = columns.find(c => c.id === targetColumnId);

        // 🎆 HIỆU ỨNG PHÁO HOA KHI THẢ VÀO CỘT DONE
        if (targetCol?.column_type === 'done') {
            triggerConfetti();
            toast.success('🎉 Chúc mừng anh đã hoàn thành công việc!');
        } else if (targetCol?.column_type === 'abort') {
            toast.warning('🚫 Đã chuyển công việc vào mục Hủy/Tạm dừng.');
        }

        // Optimistic UI
        setCards(prev => prev.map(c => c.id === draggedCardId ? { ...c, column_id: targetColumnId } : c));
        setDraggedCardId(null);

        try {
            await fetchApi(`/board/cards/${draggedCardId}/move`, {
                method: 'PUT',
                body: JSON.stringify({ column_id: targetColumnId })
            });
        } catch (err: any) {
            toast.error('Lỗi di chuyển thẻ: ' + (err.message || err));
            loadBoardData(activeBoardId);
        }
    };

    // 5. Thêm nhanh Thẻ trên Cột
    const handleQuickAddCard = async (colId: string) => {
        if (!quickAddTitle.trim()) {
            setQuickAddColId(null);
            return;
        }

        try {
            const res: any = await fetchApi('/board/cards', {
                method: 'POST',
                body: JSON.stringify({
                    board_id: activeBoardId,
                    column_id: colId,
                    title: quickAddTitle.trim(),
                    priority: 'normal',
                    category: 'other',
                    color: '#8b5cf6',
                    assigned_name: 'Hùng Nguyễn Mạnh'
                })
            });

            toast.success('Đã thêm thẻ mới!');
            setCards(prev => [res.data, ...prev]);
            setQuickAddTitle('');
            setQuickAddColId(null);
        } catch (err: any) {
            toast.error('Lỗi khi thêm thẻ: ' + (err.message || err));
        }
    };

    // 6. Tạo Board Mới
    const handleCreateBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBoardTitle.trim()) return;

        try {
            const res: any = await fetchApi('/board/boards', {
                method: 'POST',
                body: JSON.stringify({
                    title: newBoardTitle.trim(),
                    background_url: newBoardBg.trim() || null
                })
            });

            toast.success(`Đã tạo bảng "${newBoardTitle}" thành công!`);
            setBoards(prev => [...prev, res.data]);
            setActiveBoardId(res.data.id);
            setIsBoardModalOpen(false);
            setNewBoardTitle('');
            setNewBoardBg('');
        } catch (err: any) {
            toast.error('Lỗi tạo bảng: ' + (err.message || err));
        }
    };

    // 7. Cập nhật Background Board
    const handleSaveBackground = async (bgUrl: string) => {
        if (!activeBoardId) return;
        try {
            await fetchApi(`/board/boards/${activeBoardId}`, {
                method: 'PUT',
                body: JSON.stringify({ background_url: bgUrl })
            });
            setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, background_url: bgUrl } : c as any));
            toast.success('Đã đổi hình nền Board thành công!');
            setIsBgSettingsOpen(false);
        } catch (err: any) {
            toast.error('Lỗi cập nhật hình nền: ' + (err.message || err));
        }
    };

    // 8. Lưu Cột (Thêm/Sửa Cột)
    const handleSaveColumn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!columnFormTitle.trim() || !activeBoardId) return;

        try {
            if (editingColumn) {
                await fetchApi(`/board/columns/${editingColumn.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        title: columnFormTitle.trim(),
                        color: columnFormColor,
                        column_type: columnFormType
                    })
                });
                toast.success('Đã cập nhật cột!');
            } else {
                await fetchApi(`/board/boards/${activeBoardId}/columns`, {
                    method: 'POST',
                    body: JSON.stringify({
                        title: columnFormTitle.trim(),
                        color: columnFormColor,
                        column_type: columnFormType,
                        order_index: columns.length
                    })
                });
                toast.success('Đã thêm cột mới vào bảng!');
            }
            setIsColumnModalOpen(false);
            loadBoardData(activeBoardId);
        } catch (err: any) {
            toast.error('Lỗi lưu cột: ' + (err.message || err));
        }
    };

    // 9. Xóa Cột
    const handleDeleteColumn = async (colId: string) => {
        if (!window.confirm('Xóa cột này sẽ xóa tất cả các thẻ nằm bên trong cột. Anh có chắc không?')) return;
        try {
            await fetchApi(`/board/columns/${colId}`, { method: 'DELETE' });
            toast.success('Đã xóa cột.');
            setColumns(prev => prev.filter(c => c.id !== colId));
            setCards(prev => prev.filter(c => c.column_id !== colId));
        } catch (err: any) {
            toast.error('Lỗi khi xóa cột: ' + (err.message || err));
        }
    };

    // 10. Mở Modal Chi Tiết Card
    const handleOpenCardModal = (card: BoardCardItem) => {
        setActiveCard({ ...card, subtasks: card.subtasks || [] });
        setIsCardModalOpen(true);
    };

    // 11. Lưu Card Chi Tiết
    const handleSaveCard = async () => {
        if (!activeCard) return;
        setIsSavingCard(true);
        try {
            const res: any = await fetchApi(`/board/cards/${activeCard.id}`, {
                method: 'PUT',
                body: JSON.stringify(activeCard)
            });
            toast.success('Đã lưu thay đổi thẻ!');
            setCards(prev => prev.map(c => c.id === activeCard.id ? res.data : c));
            setIsCardModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu thẻ: ' + (err.message || err));
        } finally {
            setIsSavingCard(false);
        }
    };

    // 12. Định dạng Ngày Giờ
    const formatDateTime = (isoStr?: string | null) => {
        if (!isoStr) return null;
        try {
            const d = new Date(isoStr);
            const isOverdue = d.getTime() < Date.now();
            const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
            const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            return { text: `${timeStr} - ${dateStr}`, isOverdue };
        } catch {
            return null;
        }
    };

    return (
        <div
            className="relative -m-6 p-6 min-h-[calc(100vh-64px)] flex flex-col transition-all bg-cover bg-center"
            style={{
                backgroundImage: activeBoard?.background_url ? `linear-gradient(rgba(15, 23, 42, 0.75), rgba(15, 23, 42, 0.85)), url(${activeBoard.background_url})` : undefined,
                backgroundColor: activeBoard?.background_url ? undefined : '#0f172a'
            }}
        >
            {/* Top Header: Board Selector & Customization Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 bg-slate-900/60 backdrop-blur-md p-3.5 rounded-2xl border border-slate-700/60 shadow-lg text-xs">
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Board Selector */}
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-violet-400" />
                        <select
                            value={activeBoardId}
                            onChange={(e) => setActiveBoardId(e.target.value)}
                            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-100 outline-none cursor-pointer focus:ring-2 focus:ring-violet-500/40"
                        >
                            {boards.map(b => (
                                <option key={b.id} value={b.id}>📋 {b.title}</option>
                            ))}
                        </select>
                    </div>

                    {/* Nút Tạo Board Mới */}
                    <button
                        onClick={() => setIsBoardModalOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
                    >
                        <FolderPlus className="w-3.5 h-3.5 text-violet-400" />
                        Tạo Board Mới
                    </button>

                    {/* Nút Tùy Chỉnh Background */}
                    <button
                        onClick={() => setIsBgSettingsOpen(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
                    >
                        <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                        Đổi Hình Nền
                    </button>

                    {/* Nút Thêm Cột Mới */}
                    <button
                        onClick={() => {
                            setEditingColumn(null);
                            setColumnFormTitle('');
                            setColumnFormColor('#8b5cf6');
                            setColumnFormType('custom');
                            setIsColumnModalOpen(true);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl transition-all shadow-xs"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm Cột
                    </button>
                </div>

                {/* Search & Priority Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Tìm kiếm thẻ..."
                            className="pl-8 pr-3 py-1.5 bg-slate-800/90 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-400 outline-none w-44 focus:w-56 transition-all"
                        />
                    </div>

                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none"
                    >
                        <option value="all">⚡ Tất cả Priority</option>
                        <option value="urgent">🔥 Urgent</option>
                        <option value="high">⚡ High</option>
                        <option value="normal">🌿 Normal</option>
                        <option value="low">☕ Low</option>
                    </select>
                </div>
            </div>

            {/* Kanban Columns Grid */}
            <div className="flex-1 flex gap-3.5 items-start overflow-x-auto pb-4 pt-1">
                {columns.map(col => {
                    const colCards = filteredCards.filter(c => c.column_id === col.id);

                    return (
                        <div
                            key={col.id}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(col.id)}
                            className="w-72 shrink-0 bg-slate-900/75 backdrop-blur-md p-3 rounded-2xl border border-slate-700/70 flex flex-col max-h-[calc(100vh-185px)] shadow-xl transition-all"
                            style={{ borderTop: `3px solid ${col.color}` }}
                        >
                            {/* Header Cột */}
                            <div className="flex items-center justify-between mb-2.5 px-1">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: col.color }}
                                    />
                                    <h3 className="text-xs font-bold text-slate-100 truncate max-w-[130px]" title={col.title}>
                                        {col.title}
                                    </h3>
                                    <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-slate-300">
                                        {colCards.length}
                                    </span>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => {
                                            setEditingColumn(col);
                                            setColumnFormTitle(col.title);
                                            setColumnFormColor(col.color);
                                            setColumnFormType(col.column_type);
                                            setIsColumnModalOpen(true);
                                        }}
                                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md"
                                        title="Chỉnh sửa cột"
                                    >
                                        <Settings2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setQuickAddColId(col.id);
                                            setQuickAddTitle('');
                                        }}
                                        className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-md"
                                        title="Thêm thẻ nhanh"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* Ô Thêm Nhanh */}
                            {quickAddColId === col.id && (
                                <div className="bg-slate-800 p-2.5 rounded-xl border border-violet-500 mb-2.5 animate-in fade-in">
                                    <textarea
                                        rows={2}
                                        autoFocus
                                        value={quickAddTitle}
                                        onChange={(e) => setQuickAddTitle(e.target.value)}
                                        placeholder="Nhập tiêu đề thẻ..."
                                        className="w-full p-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-slate-100 outline-none"
                                    />
                                    <div className="flex items-center justify-end gap-1.5 mt-2">
                                        <button
                                            onClick={() => setQuickAddColId(null)}
                                            className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                                        >
                                            Hủy
                                        </button>
                                        <button
                                            onClick={() => handleQuickAddCard(col.id)}
                                            className="px-3 py-1 bg-violet-600 text-white rounded-lg text-[11px] font-semibold hover:bg-violet-700"
                                        >
                                            Thêm
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Danh Sách Thẻ */}
                            <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                                {colCards.length === 0 && quickAddColId !== col.id && (
                                    <div className="py-12 text-center text-slate-500 text-[11px] border border-dashed border-slate-800 rounded-xl">
                                        Kéo thả thẻ vào đây
                                    </div>
                                )}

                                {colCards.map(card => {
                                    const subtasks = card.subtasks || [];
                                    const completedSubtasks = subtasks.filter(s => s.completed).length;
                                    const dtInfo = formatDateTime(card.due_date);

                                    return (
                                        <div
                                            key={card.id}
                                            draggable
                                            onDragStart={() => handleDragStart(card.id)}
                                            onClick={() => handleOpenCardModal(card)}
                                            className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700 hover:border-violet-400 shadow-md hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative flex flex-col justify-between"
                                            style={{ borderLeft: `4px solid ${card.color || '#8b5cf6'}` }}
                                        >
                                            <div>
                                                {/* Priority & Category */}
                                                <div className="flex items-center justify-between gap-1 mb-2">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${card.priority === 'urgent' ? 'bg-rose-900/50 text-rose-300' :
                                                        card.priority === 'high' ? 'bg-amber-900/50 text-amber-300' :
                                                            'bg-slate-700 text-slate-300'
                                                        }`}>
                                                        {card.priority === 'urgent' && '🔥 '}
                                                        {card.priority}
                                                    </span>

                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                                        {card.category}
                                                    </span>
                                                </div>

                                                {/* Title */}
                                                <h4 className="text-xs font-bold text-slate-100 leading-snug line-clamp-2 mb-2">
                                                    {card.title}
                                                </h4>

                                                {/* Subtasks Progress */}
                                                {subtasks.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-2">
                                                        <CheckSquare className="w-3 h-3 text-violet-400" />
                                                        <span>{completedSubtasks}/{subtasks.length}</span>
                                                        <div className="flex-1 bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-violet-500 h-full rounded-full"
                                                                style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer: Date Time & Assignee */}
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-700/60 text-[10px]">
                                                {dtInfo ? (
                                                    <span className={`flex items-center gap-1 font-semibold ${dtInfo.isOverdue ? 'text-rose-400' : 'text-slate-300'
                                                        }`}>
                                                        <Clock className="w-3 h-3" />
                                                        {dtInfo.text}
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1 text-slate-400">
                                                        <User className="w-3 h-3" />
                                                        {card.assigned_name || 'Admin'}
                                                    </span>
                                                )}
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
            {/* MODAL 1: TẠO BOARD MỚI                                               */}
            {/* ==================================================================== */}
            {isBoardModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-xs text-slate-200">
                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                            <FolderPlus className="w-5 h-5 text-violet-400" />
                            Tạo Board Mới
                        </h3>
                        <form onSubmit={handleCreateBoard} className="space-y-4">
                            <div>
                                <label className="block font-semibold mb-1">Tên Board <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={newBoardTitle}
                                    onChange={(e) => setNewBoardTitle(e.target.value)}
                                    placeholder="VD: Quản Lý Khách Hàng / RPA Tasks..."
                                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl outline-none text-white focus:ring-2 focus:ring-violet-500/40"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold mb-1">Link Ảnh Nền (Tùy chọn)</label>
                                <input
                                    type="url"
                                    value={newBoardBg}
                                    onChange={(e) => setNewBoardBg(e.target.value)}
                                    placeholder="https://images.unsplash.com/..."
                                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl outline-none text-white text-[11px]"
                                />
                            </div>

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsBoardModalOpen(false)}
                                    className="px-4 py-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
                                >
                                    Tạo Board
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 2: TÙY CHỈNH BACKGROUND BOARD                                 */}
            {/* ==================================================================== */}
            {isBgSettingsOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-xs text-slate-200">
                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-emerald-400" />
                            Tùy Chỉnh Hình Nền Board
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block font-semibold mb-2">Hình nền mẫu sẵn:</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PRESET_WALLPAPERS.map(wp => (
                                        <div
                                            key={wp.name}
                                            onClick={() => handleSaveBackground(wp.value)}
                                            className="p-3 rounded-xl border border-slate-700 hover:border-emerald-400 cursor-pointer bg-slate-800 text-center font-medium transition-all"
                                        >
                                            {wp.name}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold mb-1">Hoặc dán URL ảnh nền:</label>
                                <div className="flex gap-2">
                                    <input
                                        type="url"
                                        defaultValue={activeBoard?.background_url || ''}
                                        id="custom-bg-input"
                                        placeholder="https://..."
                                        className="flex-1 p-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none text-[11px]"
                                    />
                                    <button
                                        onClick={() => {
                                            const input = document.getElementById('custom-bg-input') as HTMLInputElement;
                                            if (input) handleSaveBackground(input.value.trim());
                                        }}
                                        className="px-3 py-2 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700"
                                    >
                                        Lưu
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 mt-3 border-t border-slate-800">
                            <button
                                onClick={() => setIsBgSettingsOpen(false)}
                                className="px-4 py-2 bg-slate-800 rounded-xl text-slate-300"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 3: THÊM / SỬA / XÓA CỘT                                        */}
            {/* ==================================================================== */}
            {isColumnModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-xs text-slate-200">
                        <h3 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                            <Settings2 className="w-5 h-5 text-violet-400" />
                            {editingColumn ? 'Chỉnh Sửa Cột' : 'Thêm Cột Mới'}
                        </h3>

                        <form onSubmit={handleSaveColumn} className="space-y-4">
                            <div>
                                <label className="block font-semibold mb-1">Tên Cột <span className="text-rose-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={columnFormTitle}
                                    onChange={(e) => setColumnFormTitle(e.target.value)}
                                    placeholder="VD: Test QA, Cần Hỗ Trợ..."
                                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold mb-1">Màu sắc định danh cột:</label>
                                <div className="flex gap-2 flex-wrap">
                                    {COLOR_PALETTE.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColumnFormColor(c)}
                                            className={`w-7 h-7 rounded-full border-2 transition-all ${columnFormColor === c ? 'border-white scale-110' : 'border-transparent'
                                                }`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold mb-1">Loại cột (Hành vi đặc biệt):</label>
                                <select
                                    value={columnFormType}
                                    onChange={(e) => setColumnFormType(e.target.value)}
                                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                                >
                                    <option value="custom">📌 Cột thông thường (Custom)</option>
                                    <option value="backlog">📋 Backlog (Tiếp nhận)</option>
                                    <option value="todo">⏳ To Do (Cần làm)</option>
                                    <option value="in_progress">⚡ In Progress (Đang làm)</option>
                                    <option value="review">🔍 Review (Chờ duyệt)</option>
                                    <option value="done">🎉 Done (Kích hoạt pháo hoa khi thả vào)</option>
                                    <option value="abort">🚫 Abort / Hủy bỏ</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                                {editingColumn ? (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteColumn(editingColumn.id)}
                                        className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Xóa Cột Này
                                    </button>
                                ) : <div />}

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsColumnModalOpen(false)}
                                        className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
                                    >
                                        Lưu Cột
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ==================================================================== */}
            {/* MODAL 4: CHI TIẾT & CHỈNH SỬA CARD (FULL NGÀY GIỜ + MÀU THẺ)         */}
            {/* ==================================================================== */}
            {isCardModalOpen && activeCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 text-xs text-slate-200 relative max-h-[90vh] flex flex-col">
                        <button
                            onClick={() => setIsCardModalOpen(false)}
                            className="absolute right-4 top-4 text-slate-400 hover:text-white"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        {/* Tiêu đề & Màu Thẻ */}
                        <div className="flex items-center gap-2 mb-3">
                            <input
                                type="text"
                                value={activeCard.title}
                                onChange={(e) => setActiveCard({ ...activeCard, title: e.target.value })}
                                className="text-base font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-violet-500 outline-none flex-1 pb-1"
                            />
                        </div>

                        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                            {/* Thuộc tính Grid */}
                            <div className="grid grid-cols-2 gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Mức độ ưu tiên</label>
                                    <select
                                        value={activeCard.priority}
                                        onChange={(e) => setActiveCard({ ...activeCard, priority: e.target.value as any })}
                                        className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-bold"
                                    >
                                        <option value="urgent">🔥 Khẩn cấp (Urgent)</option>
                                        <option value="high">⚡ Cao (High)</option>
                                        <option value="normal">🌿 Bình thường (Normal)</option>
                                        <option value="low">☕ Thấp (Low)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Màu sắc thẻ</label>
                                    <div className="flex gap-1.5">
                                        {COLOR_PALETTE.slice(0, 5).map(c => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setActiveCard({ ...activeCard, color: c })}
                                                className={`w-6 h-6 rounded-full border ${activeCard.color === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Người phụ trách</label>
                                    <input
                                        type="text"
                                        value={activeCard.assigned_name || ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, assigned_name: e.target.value })}
                                        className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white"
                                    />
                                </div>

                                <div>
                                    {/* 🟢 HẠN CHÓT: NGÀY VÀ GIỜ CHI TIẾT */}
                                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Hạn chót (Ngày & Giờ)</label>
                                    <input
                                        type="datetime-local"
                                        value={activeCard.due_date ? activeCard.due_date.slice(0, 16) : ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        className="w-full p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-[11px]"
                                    />
                                </div>
                            </div>

                            {/* Mô tả */}
                            <div>
                                <label className="block font-semibold mb-1">Mô tả công việc</label>
                                <textarea
                                    rows={3}
                                    value={activeCard.description || ''}
                                    onChange={(e) => setActiveCard({ ...activeCard, description: e.target.value })}
                                    placeholder="Ghi chú chi tiết..."
                                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                                />
                            </div>

                            {/* Subtasks */}
                            <div>
                                <label className="block font-semibold mb-1.5 flex justify-between">
                                    <span>Checklist công việc con:</span>
                                    <span className="text-slate-400 font-normal">
                                        {(activeCard.subtasks || []).filter(s => s.completed).length}/{(activeCard.subtasks || []).length}
                                    </span>
                                </label>

                                <div className="space-y-1.5 mb-2">
                                    {(activeCard.subtasks || []).map(sub => (
                                        <div key={sub.id} className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg">
                                            <input
                                                type="checkbox"
                                                checked={sub.completed}
                                                onChange={() => {
                                                    const updated = (activeCard.subtasks || []).map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s);
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                            />
                                            <span className={`flex-1 ${sub.completed ? 'line-through text-slate-500' : 'text-white'}`}>{sub.title}</span>
                                            <button
                                                onClick={() => {
                                                    const updated = (activeCard.subtasks || []).filter(s => s.id !== sub.id);
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                                className="text-slate-400 hover:text-rose-400"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newSubtaskTitle}
                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newSubtaskTitle.trim()) {
                                                setActiveCard({
                                                    ...activeCard,
                                                    subtasks: [...(activeCard.subtasks || []), { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false }]
                                                });
                                                setNewSubtaskTitle('');
                                            }
                                        }}
                                        placeholder="Thêm đầu việc mới..."
                                        className="flex-1 p-2 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!newSubtaskTitle.trim()) return;
                                            setActiveCard({
                                                ...activeCard,
                                                subtasks: [...(activeCard.subtasks || []), { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false }]
                                            });
                                            setNewSubtaskTitle('');
                                        }}
                                        className="px-3 py-2 bg-slate-800 text-white rounded-xl"
                                    >
                                        Thêm
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4 mt-3 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!window.confirm('Xóa thẻ này?')) return;
                                    await fetchApi(`/board/cards/${activeCard.id}`, { method: 'DELETE' });
                                    setCards(prev => prev.filter(c => c.id !== activeCard.id));
                                    setIsCardModalOpen(false);
                                }}
                                className="text-rose-400 font-semibold"
                            >
                                Xóa Thẻ
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsCardModalOpen(false)}
                                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl"
                                >
                                    Hủy
                                </button>
                                <button
                                    disabled={isSavingCard}
                                    onClick={handleSaveCard}
                                    className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl"
                                >
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