// frontend/src/features/board/WorkBoardPage.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
    Plus,
    Sliders,
    Search,
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
    Settings2,
    Layers,
    FolderPlus,
    Tag,
    CheckCircle2,
    Ban,
    RotateCcw,
    UploadCloud,
    ArrowRight,
    MoreVertical,
    Edit2
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { BoardItem, BoardColumnItem, BoardCardItem, BoardSubtask, BoardPriorityItem } from '../../types';

const PRESET_OVERLAYS = [
    { name: 'Đen Mờ (Dark)', color: '#000000' },
    { name: 'Trắng Sáng (Light)', color: '#ffffff' },
    { name: 'Xanh Navy (Deep Blue)', color: '#0f172a' },
    { name: 'Indigo Đậm (Deep Indigo)', color: '#1e1b4b' },
    { name: 'Xám Khói (Slate)', color: '#334155' }
];

export const WorkBoardPage: React.FC = () => {
    const [boards, setBoards] = useState<BoardItem[]>([]);
    const [trashBoards, setTrashBoards] = useState<BoardItem[]>([]);
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
    const [dragOverColId, setDragOverColId] = useState<string | null>(null);

    // Modals
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
    const [settingsTab, setSettingsTab] = useState<'visuals' | 'taxonomy' | 'trash'>('visuals');

    const [isNewBoardModalOpen, setIsNewBoardModalOpen] = useState<boolean>(false);
    const [newBoardTitle, setNewBoardTitle] = useState<string>('');

    const [isColumnModalOpen, setIsColumnModalOpen] = useState<boolean>(false);
    const [editingColumn, setEditingColumn] = useState<BoardColumnItem | null>(null);
    const [columnFormTitle, setColumnFormTitle] = useState<string>('');
    const [columnFormColor, setColumnFormColor] = useState<string>('#4f46e5');
    const [columnFormType, setColumnFormType] = useState<string>('custom');

    const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
    const [activeCard, setActiveCard] = useState<BoardCardItem | null>(null);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState<string>('');
    const [isSavingCard, setIsSavingCard] = useState<boolean>(false);

    // Quick Inline Add Card State
    const [inlineAddingColId, setInlineAddingColId] = useState<string | null>(null);
    const [inlineTaskTitle, setInlineTaskTitle] = useState<string>('');
    const [quickAddPriority, setQuickAddPriority] = useState<string>('low');
    const [quickAddCategory, setQuickAddCategory] = useState<string>('Khác');

    // Column Dropdown menu state
    const [openColumnMenuId, setOpenColumnMenuId] = useState<string | null>(null);

    // Board Settings Temporary State
    const [boardOverlayColor, setBoardOverlayColor] = useState<string>('#000000');
    const [boardOverlayOpacity, setBoardOverlayOpacity] = useState<number>(0.35);
    const [boardColumnOpacity, setBoardColumnOpacity] = useState<number>(0.75);
    const [boardCardOpacity, setBoardCardOpacity] = useState<number>(0.85);
    const [newCategoryInput, setNewCategoryInput] = useState<string>('');
    const [isUploadingBg, setIsUploadingBg] = useState<boolean>(false);

    // Custom Confirm Dialog State (Thay thế window.confirm)
    const [confirmDialog, setConfirmDialog] = useState<{
        isOpen: boolean;
        title: string;
        description: string;
        confirmText?: string;
        variant?: 'danger' | 'warning' | 'primary';
        onConfirm: () => void;
    } | null>(null);

    const bgFileInputRef = useRef<HTMLInputElement>(null);

    // ⚡ 1. TẢI BOARDS TRỰC TIẾP TỪ API
    const loadBoards = useCallback(async () => {
        try {
            const [activeData, trashData] = await Promise.all([
                fetchApi<BoardItem[]>('/board/boards'),
                fetchApi<BoardItem[]>('/board/boards/trash')
            ]);
            setBoards(activeData);
            setTrashBoards(trashData);

            if (activeData.length > 0) {
                if (!activeBoardId || !activeData.some((b) => b.id === activeBoardId)) {
                    const defaultB = activeData.find((b) => b.is_default) || activeData[0];
                    setActiveBoardId(defaultB.id);
                }
            }
        } catch (err: any) {
            if (boards.length === 0) {
                toast.error('Lỗi nạp danh sách bảng: ' + (err.message || err));
            }
        }
    }, [activeBoardId, boards.length]);

    useEffect(() => {
        loadBoards();
    }, [loadBoards]);

    // ⚡ 2. TẢI CỘT & THẺ TRỰC TIẾP TỪ API
    const loadBoardData = useCallback(async (boardId: string, forceSpinner = false) => {
        if (!boardId) return;

        if (forceSpinner) {
            setIsLoading(true);
        }

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
            const curBoard = boards.find((b) => b.id === activeBoardId);
            if (curBoard) {
                setBoardOverlayColor(curBoard.overlay_color || '#000000');
                setBoardOverlayOpacity(curBoard.overlay_opacity ?? 0.35);
                setBoardColumnOpacity(curBoard.column_opacity ?? 0.75);
                setBoardCardOpacity(curBoard.card_opacity ?? 0.85);
            }
        }
    }, [activeBoardId, loadBoardData, boards]);

    const activeBoard = useMemo(() => boards.find((b) => b.id === activeBoardId), [boards, activeBoardId]);

    const boardCategories: string[] = useMemo(() => {
        return activeBoard?.categories || ['System Bug', 'Keycloak Account', 'LMS Enroll', 'License', 'Khác'];
    }, [activeBoard]);

    const boardPriorities: BoardPriorityItem[] = useMemo(() => {
        return activeBoard?.priorities || [
            { key: 'low', label: 'Thấp', color: '#64748b' },
            { key: 'normal', label: 'Bình thường', color: '#38bdf8' },
            { key: 'high', label: 'Cao', color: '#fbbf24' },
            { key: 'urgent', label: 'Khẩn cấp', color: '#f43f5e' }
        ];
    }, [activeBoard]);

    // 3. Lọc Cards
    const filteredCards = useMemo(() => {
        return cards.filter((card) => {
            const q = searchQuery.toLowerCase().trim();
            const matchSearch =
                !q ||
                card.title.toLowerCase().includes(q) ||
                (card.description && card.description.toLowerCase().includes(q)) ||
                (card.assigned_name && card.assigned_name.toLowerCase().includes(q));

            const matchPriority = filterPriority === 'all' || card.priority === filterPriority;
            const matchCat = filterCategory === 'all' || card.category === filterCategory;

            return matchSearch && matchPriority && matchCat;
        });
    }, [cards, searchQuery, filterPriority, filterCategory]);

    // 4. Xử lý Drag & Drop Thẻ
    const handleDragStart = (cardId: string) => setDraggedCardId(cardId);
    const handleDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        if (dragOverColId !== colId) setDragOverColId(colId);
    };

    const handleDrop = async (targetColumnId: string) => {
        setDragOverColId(null);
        if (!draggedCardId) return;
        const targetCard = cards.find((c) => c.id === draggedCardId);
        if (!targetCard || targetCard.column_id === targetColumnId) {
            setDraggedCardId(null);
            return;
        }

        const targetCol = columns.find((c) => c.id === targetColumnId);

        if (targetCol?.column_type === 'done') {
            toast.success(`✓ Đã hoàn thành công việc: "${targetCard.title}"`);
        } else if (targetCol?.column_type === 'abort') {
            toast.error(`🚫 Đã hủy/tạm dừng: "${targetCard.title}"`);
        } else {
            toast.info(`Đã chuyển sang [${targetCol?.title}]`);
        }

        const updatedCards = cards.map((c) => (c.id === draggedCardId ? { ...c, column_id: targetColumnId } : c));
        setCards(updatedCards);
        setDraggedCardId(null);

        try {
            await fetchApi(`/board/cards/${draggedCardId}/move`, {
                method: 'PUT',
                body: JSON.stringify({ column_id: targetColumnId })
            });
        } catch (err: any) {
            loadBoardData(activeBoardId, true);
        }
    };

    // 5. Thêm nhanh Thẻ
    const handleQuickAddCard = async (colId: string) => {
        if (!inlineTaskTitle.trim()) {
            setInlineAddingColId(null);
            return;
        }

        try {
            const res: any = await fetchApi('/board/cards', {
                method: 'POST',
                body: JSON.stringify({
                    board_id: activeBoardId,
                    column_id: colId,
                    title: inlineTaskTitle.trim(),
                    priority: quickAddPriority,
                    category: quickAddCategory,
                    color: '#8b5cf6',
                    assigned_name: 'Hùng Nguyễn Mạnh'
                })
            });

            toast.success('Đã thêm thẻ mới!');
            const updated = [res.data, ...cards];
            setCards(updated);
            setInlineTaskTitle('');
            setInlineAddingColId(null);
            setQuickAddPriority('low');
            setQuickAddCategory('Khác');
        } catch (err: any) {
            toast.error('Lỗi thêm thẻ: ' + (err.message || err));
        }
    };

    // 6. Upload Ảnh Nền Board
    const handleUploadBgFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeBoardId) return;

        setIsUploadingBg(true);
        const toastId = toast.loading('Đang tải ảnh nền lên Supabase...');

        try {
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const filePath = `board_backgrounds/bg_${Date.now()}_${cleanFileName}`;

            const { error: uploadError } = await supabase.storage
                .from('ticket-attachments')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('ticket-attachments').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            await fetchApi(`/board/boards/${activeBoardId}`, {
                method: 'PUT',
                body: JSON.stringify({ background_url: publicUrl })
            });

            const updatedBoards = boards.map((b) => (b.id === activeBoardId ? { ...b, background_url: publicUrl } : b));
            setBoards(updatedBoards);
            toast.success('Đã áp dụng ảnh nền mới!', { id: toastId });
        } catch (err: any) {
            toast.error('Lỗi tải ảnh: ' + (err.message || err), { id: toastId });
        } finally {
            setIsUploadingBg(false);
            if (bgFileInputRef.current) bgFileInputRef.current.value = '';
        }
    };

    // 7. Lưu Cài Đặt Board
    const handleSaveBoardSettings = async () => {
        if (!activeBoardId) return;
        try {
            await fetchApi(`/board/boards/${activeBoardId}`, {
                method: 'PUT',
                body: JSON.stringify({
                    overlay_color: boardOverlayColor,
                    overlay_opacity: boardOverlayOpacity,
                    column_opacity: boardColumnOpacity,
                    card_opacity: boardCardOpacity,
                    categories: boardCategories,
                    priorities: boardPriorities
                })
            });

            const updatedBoards = boards.map((b) =>
                b.id === activeBoardId
                    ? {
                        ...b,
                        overlay_color: boardOverlayColor,
                        overlay_opacity: boardOverlayOpacity,
                        column_opacity: boardColumnOpacity,
                        card_opacity: boardCardOpacity,
                        categories: boardCategories,
                        priorities: boardPriorities
                    }
                    : b
            );

            setBoards(updatedBoards);
            toast.success('Đã lưu toàn bộ thiết lập Board!');
            setIsSettingsModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu cài đặt: ' + (err.message || err));
        }
    };

    // 8. Xóa Board (Soft Delete)
    const handleSoftDeleteBoard = () => {
        if (!activeBoardId) return;
        setConfirmDialog({
            isOpen: true,
            title: 'Chuyển Bảng Vào Thùng Rác?',
            description: `Bảng "${activeBoard?.title}" sẽ được chuyển vào Thùng rác và lưu trữ an toàn trong 30 ngày trước khi tự động hủy.`,
            confirmText: 'Chuyển Vào Thùng Rác',
            variant: 'warning',
            onConfirm: async () => {
                try {
                    await fetchApi(`/board/boards/${activeBoardId}`, { method: 'DELETE' });
                    toast.success('Đã chuyển bảng vào Thùng rác.');
                    setConfirmDialog(null);
                    setIsSettingsModalOpen(false);
                    loadBoards();
                } catch (err: any) {
                    toast.error('Lỗi xóa bảng: ' + (err.message || err));
                }
            }
        });
    };

    // 9. Khôi phục Board
    const handleRestoreBoard = async (bId: string) => {
        try {
            await fetchApi(`/board/boards/${bId}/restore`, { method: 'PUT' });
            toast.success('Đã khôi phục bảng!');
            loadBoards();
        } catch (err: any) {
            toast.error('Lỗi khôi phục: ' + (err.message || err));
        }
    };

    // 10. Xóa Vĩnh Viễn Board
    const handlePermanentDeleteBoard = (bId: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Xóa Vĩnh Viễn Bảng Này?',
            description: 'Hành động này sẽ XÓA VĨNH VIỄN toàn bộ Cột và Thẻ công việc của bảng này và KHÔNG THỂ PHỤC HỒI. Bạn có chắc chắn không?',
            confirmText: 'Xóa Vĩnh Viễn',
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await fetchApi(`/board/boards/${bId}/permanent`, { method: 'DELETE' });
                    toast.success('Đã xóa vĩnh viễn bảng.');
                    setConfirmDialog(null);
                    loadBoards();
                } catch (err: any) {
                    toast.error('Lỗi xóa vĩnh viễn: ' + (err.message || err));
                }
            }
        });
    };

    // 11. Xóa Cột
    const handleDeleteColumn = (colId: string) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Xác Nhận Xóa Cột Này?',
            description: 'Toàn bộ thẻ nhiệm vụ thuộc cột này cũng sẽ bị xóa. Bạn có chắc chắn muốn tiếp tục?',
            confirmText: 'Xóa Cột',
            variant: 'danger',
            onConfirm: async () => {
                try {
                    await fetchApi(`/board/columns/${colId}`, { method: 'DELETE' });
                    toast.success('Đã xóa cột!');
                    setConfirmDialog(null);
                    loadBoardData(activeBoardId, true);
                } catch (err: any) {
                    toast.error('Lỗi xóa cột: ' + (err.message || err));
                }
            }
        });
    };

    // 12. Lưu Card Chi Tiết
    const handleSaveCardDetail = async () => {
        if (!activeCard) return;
        setIsSavingCard(true);
        try {
            const res: any = await fetchApi(`/board/cards/${activeCard.id}`, {
                method: 'PUT',
                body: JSON.stringify(activeCard)
            });
            toast.success('Đã lưu thay đổi thẻ!');
            const updated = cards.map((c) => (c.id === activeCard.id ? res.data : c));
            setCards(updated);
            setIsCardModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu thẻ: ' + (err.message || err));
        } finally {
            setIsSavingCard(false);
        }
    };

    const hexToRgba = (hex: string, opacity: number) => {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map((x) => x + x).join('');
        const num = parseInt(c, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
    };

    return (
        <div className="relative w-full h-full flex-1 flex flex-col overflow-hidden bg-slate-950 text-slate-100">
            {/* 🖼️ Lớp Hình Nền + Lớp Phủ Màu Mờ Tùy Chỉnh (0-100%) */}
            {activeBoard?.background_url && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-all duration-500 pointer-events-none"
                    style={{ backgroundImage: `url(${activeBoard.background_url})` }}
                />
            )}
            <div
                className="absolute inset-0 transition-all duration-300 pointer-events-none"
                style={{
                    backgroundColor: activeBoard?.overlay_color || '#000000',
                    opacity: activeBoard?.overlay_opacity ?? 0.35,
                    backdropFilter: 'blur(1px)'
                }}
            />

            {/* Content Container */}
            <div className="relative z-10 w-full h-full flex-1 flex flex-col p-3 sm:p-4 space-y-3 overflow-hidden min-h-0">
                {/* Top Control Bar */}
                <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Board Selector */}
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                            <select
                                value={activeBoardId}
                                onChange={(e) => setActiveBoardId(e.target.value)}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer focus:ring-2 focus:ring-indigo-500 shadow-xs"
                            >
                                {boards.map((b) => (
                                    <option key={b.id} value={b.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium">
                                        📋 {b.title}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Nút Tạo Board */}
                        <button
                            onClick={() => setIsNewBoardModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-xs font-semibold"
                        >
                            <FolderPlus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                            <span>Tạo Board</span>
                        </button>

                        {/* Nút Cài Đặt Chuyên Sâu */}
                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition cursor-pointer shadow-xs font-semibold"
                        >
                            <Sliders className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Tùy Chỉnh Board</span>
                        </button>

                        {/* Nút Thêm Cột */}
                        <button
                            onClick={() => {
                                setEditingColumn(null);
                                setColumnFormTitle('');
                                setColumnFormColor('#4f46e5');
                                setColumnFormType('custom');
                                setIsColumnModalOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition cursor-pointer shadow-xs"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Thêm Cột</span>
                        </button>
                    </div>

                    {/* Search & Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm thẻ nhiệm vụ..."
                                className="pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none w-36 focus:w-48 transition-all shadow-xs"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>

                        {/* Lọc Priority */}
                        <select
                            value={filterPriority}
                            onChange={(e) => setFilterPriority(e.target.value)}
                            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer shadow-xs"
                        >
                            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">⚡ Tất cả Priority</option>
                            {boardPriorities.map((p) => (
                                <option key={p.key} value={p.key} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                    {p.label}
                                </option>
                            ))}
                        </select>

                        {/* Lọc Category */}
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer shadow-xs"
                        >
                            <option value="all" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🏷️ Tất cả Phân loại</option>
                            {boardCategories.map((cat) => (
                                <option key={cat} value={cat} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Kanban Board Columns Area (Tự động co theo thẻ, cuộn ngang mượt mà) */}
                <div className="flex-1 flex gap-3.5 items-start overflow-x-auto overflow-y-hidden pb-2 min-h-0 scrollbar-thin">
                    {columns.map((col) => {
                        const colCards = filteredCards.filter((c) => c.column_id === col.id);
                        const isDoneCol = col.column_type === 'done';
                        const isAbortCol = col.column_type === 'abort';
                        const isDragOver = dragOverColId === col.id;

                        return (
                            <div
                                key={col.id}
                                onDragOver={(e) => handleDragOver(e, col.id)}
                                onDrop={() => handleDrop(col.id)}
                                className={`w-72 sm:w-80 shrink-0 p-3 rounded-2xl border transition-all flex flex-col max-h-full shadow-xl overflow-hidden ${isDragOver ? 'ring-2 ring-indigo-500 border-indigo-500 scale-[1.01]' : 'border-slate-800'
                                    }`}
                                style={{
                                    backgroundColor: hexToRgba('#0f172a', activeBoard?.column_opacity ?? 0.75),
                                    borderTop: `3px solid ${col.color}`
                                }}
                            >
                                {/* Header Cột */}
                                <div className="shrink-0 flex items-center justify-between mb-2.5 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{ backgroundColor: col.color }} />
                                        <h3 className="text-xs font-bold text-white truncate max-w-[130px]">{col.title}</h3>
                                        <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-slate-300 font-mono">
                                            {colCards.length}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1 relative">
                                        <button
                                            onClick={() => {
                                                setInlineAddingColId(col.id);
                                                setInlineTaskTitle('');
                                                setQuickAddPriority('low');
                                                setQuickAddCategory('Khác');
                                            }}
                                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-md cursor-pointer"
                                            title="Thêm thẻ nhanh"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>

                                        <button
                                            onClick={() => setOpenColumnMenuId(openColumnMenuId === col.id ? null : col.id)}
                                            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-md cursor-pointer"
                                            title="Tùy chọn cột"
                                        >
                                            <MoreVertical className="w-3.5 h-3.5" />
                                        </button>

                                        {openColumnMenuId === col.id && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setOpenColumnMenuId(null)} />
                                                <div className="absolute right-0 top-6 w-44 rounded-2xl shadow-2xl border border-slate-700 bg-slate-900 z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">
                                                    <button
                                                        onClick={() => {
                                                            setEditingColumn(col);
                                                            setColumnFormTitle(col.title);
                                                            setColumnFormColor(col.color);
                                                            setColumnFormType(col.column_type);
                                                            setIsColumnModalOpen(true);
                                                            setOpenColumnMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left hover:bg-slate-800 font-semibold text-slate-200"
                                                    >
                                                        <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
                                                        <span>Sửa Cột</span>
                                                    </button>
                                                    <div className="h-px bg-slate-800 my-1" />
                                                    <button
                                                        onClick={() => {
                                                            handleDeleteColumn(col.id);
                                                            setOpenColumnMenuId(null);
                                                        }}
                                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left text-rose-400 hover:bg-rose-950/40 font-semibold"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                        <span>Xóa Cột</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Ô Thêm Nhanh Thẻ */}
                                {inlineAddingColId === col.id && (
                                    <div className="bg-slate-900/90 p-2.5 rounded-xl border border-indigo-500 mb-2.5 text-xs space-y-2 animate-in fade-in shadow-lg">
                                        <textarea
                                            rows={2}
                                            autoFocus
                                            value={inlineTaskTitle}
                                            onChange={(e) => setInlineTaskTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleQuickAddCard(col.id);
                                                }
                                                if (e.key === 'Escape') setInlineAddingColId(null);
                                            }}
                                            placeholder="Nhập tiêu đề thẻ (Enter để lưu)..."
                                            className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white outline-none text-xs"
                                        />

                                        <div className="grid grid-cols-2 gap-1.5">
                                            <select
                                                value={quickAddPriority}
                                                onChange={(e) => setQuickAddPriority(e.target.value)}
                                                className="p-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-300 outline-none cursor-pointer"
                                            >
                                                {boardPriorities.map((p) => (
                                                    <option key={p.key} value={p.key}>
                                                        {p.label}
                                                    </option>
                                                ))}
                                            </select>

                                            <select
                                                value={quickAddCategory}
                                                onChange={(e) => setQuickAddCategory(e.target.value)}
                                                className="p-1 bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-300 outline-none cursor-pointer"
                                            >
                                                {boardCategories.map((cat) => (
                                                    <option key={cat} value={cat}>
                                                        {cat}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-end gap-1.5 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setInlineAddingColId(null)}
                                                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
                                            >
                                                Hủy
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleQuickAddCard(col.id)}
                                                className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-[11px] font-semibold hover:bg-indigo-700 cursor-pointer shadow-xs"
                                            >
                                                Lưu Thẻ
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Danh Sách Thẻ */}
                                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5 min-h-0 scrollbar-thin">
                                    {colCards.map((card) => {
                                        const subtasks = card.subtasks || [];
                                        const completedSubtasks = subtasks.filter((s) => s.completed).length;
                                        const priorityObj = boardPriorities.find((p) => p.key === card.priority) || {
                                            label: card.priority,
                                            color: '#64748b'
                                        };

                                        return (
                                            <div
                                                key={card.id}
                                                draggable
                                                onDragStart={() => handleDragStart(card.id)}
                                                onClick={() => {
                                                    setActiveCard({ ...card, subtasks: card.subtasks || [] });
                                                    setIsCardModalOpen(true);
                                                }}
                                                className={`p-3.5 rounded-xl border border-slate-800/80 shadow-md hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative ${isDoneCol ? 'opacity-75 bg-emerald-950/30 border-emerald-800' : isAbortCol ? 'opacity-65 bg-rose-950/30 border-rose-900' : ''
                                                    }`}
                                                style={{
                                                    backgroundColor:
                                                        isDoneCol || isAbortCol
                                                            ? undefined
                                                            : hexToRgba('#1e293b', activeBoard?.card_opacity ?? 0.85),
                                                    borderLeft: `4px solid ${isDoneCol
                                                        ? '#10b981'
                                                        : isAbortCol
                                                            ? '#f43f5e'
                                                            : card.color || '#6366f1'
                                                        }`
                                                }}
                                            >
                                                {/* Priority & Category Badges */}
                                                <div className="flex items-center justify-between gap-1 mb-2">
                                                    <span
                                                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                                                        style={{
                                                            backgroundColor: priorityObj.color + '30',
                                                            color: priorityObj.color
                                                        }}
                                                    >
                                                        {priorityObj.label}
                                                    </span>

                                                    <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded">
                                                        {card.category || 'Khác'}
                                                    </span>
                                                </div>

                                                {/* Tiêu đề */}
                                                <div className="flex items-start gap-1.5 mb-2">
                                                    {isDoneCol && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />}
                                                    {isAbortCol && <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />}
                                                    <h4
                                                        className={`text-xs font-bold text-white leading-snug line-clamp-2 ${isDoneCol ? 'text-slate-300' : isAbortCol ? 'line-through text-slate-400' : ''
                                                            }`}
                                                    >
                                                        {card.title}
                                                    </h4>
                                                </div>

                                                {/* Subtasks Progress */}
                                                {subtasks.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-2">
                                                        <CheckSquare className="w-3 h-3 text-indigo-400" />
                                                        <span>
                                                            {completedSubtasks}/{subtasks.length}
                                                        </span>
                                                        <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-indigo-500 h-full rounded-full"
                                                                style={{
                                                                    width: `${(completedSubtasks / subtasks.length) * 100}%`
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Footer */}
                                                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                                                    <span className="flex items-center gap-1 truncate max-w-[120px]">
                                                        <User className="w-3 h-3" />
                                                        {card.assigned_name || 'Hùng Nguyễn'}
                                                    </span>
                                                    {card.due_date && (
                                                        <span className="flex items-center gap-1 text-slate-300 font-mono">
                                                            <Clock className="w-3 h-3" />
                                                            {new Date(card.due_date).toLocaleDateString('vi-VN', {
                                                                day: '2-digit',
                                                                month: '2-digit'
                                                            })}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Nút Thêm Thẻ Mới Trực Tiếp ở Chân Cột */}
                                    {inlineAddingColId !== col.id && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setInlineAddingColId(col.id);
                                                setInlineTaskTitle('');
                                                setQuickAddPriority('low');
                                                setQuickAddCategory('Khác');
                                            }}
                                            className="w-full mt-2 py-2 px-3 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700/80 hover:border-indigo-500/80 bg-slate-900/30 hover:bg-indigo-950/30 text-slate-400 hover:text-indigo-300 text-xs font-semibold transition-all cursor-pointer group shadow-2xs"
                                        >
                                            <Plus className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                            <span>Thêm thẻ nhiệm vụ</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ----------------------------------------------------
          MODALS BENTO SECTION
          ---------------------------------------------------- */}

            {/* 1. MODAL: TÙY CHỈNH BOARD */}
            {isSettingsModalOpen && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsSettingsModalOpen(false);
                    }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,760px)] p-6 sm:p-8 text-xs text-slate-800 dark:text-slate-200 shadow-2xl relative max-h-[92vh] flex flex-col my-auto"
                    >
                        <button
                            onClick={() => setIsSettingsModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <Sliders className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            Tùy Chỉnh Toàn Diện – [{activeBoard?.title}]
                        </h3>

                        {/* 3 Tabs Điều Khiển */}
                        <div className="flex bg-slate-100 dark:bg-slate-950 p-1.5 rounded-2xl mb-4 text-xs border border-slate-200 dark:border-slate-800 gap-1">
                            <button
                                type="button"
                                onClick={() => setSettingsTab('visuals')}
                                className={`flex-1 py-2 rounded-xl font-bold transition-all cursor-pointer ${settingsTab === 'visuals'
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                    }`}
                            >
                                🎨 Hình Nền & Độ Mờ
                            </button>
                            <button
                                type="button"
                                onClick={() => setSettingsTab('taxonomy')}
                                className={`flex-1 py-2 rounded-xl font-bold transition-all cursor-pointer ${settingsTab === 'taxonomy'
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                    }`}
                            >
                                🏷️ Phân Loại & Priority
                            </button>
                            <button
                                type="button"
                                onClick={() => setSettingsTab('trash')}
                                className={`flex-1 py-2 rounded-xl font-bold transition-all cursor-pointer ${settingsTab === 'trash'
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                    }`}
                            >
                                🗑️ Thùng Rác ({trashBoards.length})
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin">
                            {settingsTab === 'visuals' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block font-semibold mb-1.5 text-slate-700 dark:text-slate-300">Ảnh Nền Board:</label>
                                        <input
                                            type="file"
                                            ref={bgFileInputRef}
                                            onChange={handleUploadBgFile}
                                            accept="image/*"
                                            className="hidden"
                                        />
                                        <div
                                            onClick={() => !isUploadingBg && bgFileInputRef.current?.click()}
                                            className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-400 p-4 rounded-2xl text-center cursor-pointer bg-slate-50 dark:bg-slate-950/50 transition-colors"
                                        >
                                            {isUploadingBg ? (
                                                <span className="text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-2 font-medium">
                                                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải lên Supabase...
                                                </span>
                                            ) : (
                                                <span className="text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2 font-medium">
                                                    <UploadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Bấm để chọn ảnh nền mới từ máy tính
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block font-semibold mb-1.5 text-slate-700 dark:text-slate-300">Màu Lớp Phủ (Overlay Color):</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {PRESET_OVERLAYS.map((ov) => (
                                                <button
                                                    key={ov.name}
                                                    type="button"
                                                    onClick={() => setBoardOverlayColor(ov.color)}
                                                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-medium transition-all cursor-pointer ${boardOverlayColor === ov.color
                                                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold ring-2 ring-emerald-500/20'
                                                        : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800'
                                                        }`}
                                                >
                                                    {ov.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-slate-950/80 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4 shadow-xs">
                                        <div>
                                            <div className="flex justify-between mb-1 text-slate-700 dark:text-slate-300">
                                                <span className="font-semibold">Độ mờ tối của Lớp Phủ Board:</span>
                                                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{Math.round(boardOverlayOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value={boardOverlayOpacity}
                                                onChange={(e) => setBoardOverlayOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-emerald-500 cursor-pointer"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between mb-1 text-slate-700 dark:text-slate-300">
                                                <span className="font-semibold">Độ trong suốt nền Cột (Columns):</span>
                                                <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{Math.round(boardColumnOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={boardColumnOpacity}
                                                onChange={(e) => setBoardColumnOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-indigo-500 cursor-pointer"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between mb-1 text-slate-700 dark:text-slate-300">
                                                <span className="font-semibold">Độ trong suốt nền Thẻ (Cards):</span>
                                                <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{Math.round(boardCardOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.2"
                                                max="1"
                                                step="0.05"
                                                value={boardCardOpacity}
                                                onChange={(e) => setBoardCardOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-sky-500 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'taxonomy' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block font-semibold mb-2 text-slate-700 dark:text-slate-300">
                                            Danh sách Phân Loại (Categories) áp dụng cho Board:
                                        </label>
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {boardCategories.map((cat, idx) => (
                                                <span
                                                    key={idx}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 font-semibold shadow-xs"
                                                >
                                                    {cat}
                                                    {boardCategories.length > 1 && (
                                                        <button
                                                            onClick={() => {
                                                                const updated = boardCategories.filter((_, i) => i !== idx);
                                                                setBoards((prev) =>
                                                                    prev.map((b) => (b.id === activeBoardId ? { ...b, categories: updated } : b))
                                                                );
                                                            }}
                                                            className="text-slate-400 hover:text-rose-500 cursor-pointer"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newCategoryInput}
                                                onChange={(e) => setNewCategoryInput(e.target.value)}
                                                placeholder="Thêm phân loại mới..."
                                                className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!newCategoryInput.trim()) return;
                                                    const updated = [...boardCategories, newCategoryInput.trim()];
                                                    setBoards((prev) =>
                                                        prev.map((b) => (b.id === activeBoardId ? { ...b, categories: updated } : b))
                                                    );
                                                    setNewCategoryInput('');
                                                }}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer transition shadow-xs"
                                            >
                                                Thêm
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'trash' && (
                                <div className="space-y-4">
                                    <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-rose-700 dark:text-rose-400">Xóa Bảng Hiện Tại</h4>
                                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                                Bảng sẽ chuyển vào Thùng rác và lưu trữ an toàn trong 30 ngày.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSoftDeleteBoard}
                                            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition"
                                        >
                                            Xóa Bảng Này
                                        </button>
                                    </div>

                                    <div>
                                        <h4 className="font-bold mb-2 text-slate-700 dark:text-slate-300">
                                            Danh sách Bảng trong Thùng rác (Tự hủy sau 30 ngày):
                                        </h4>
                                        {trashBoards.length === 0 ? (
                                            <div className="p-6 text-center text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                                                Thùng rác trống.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {trashBoards.map((tb) => (
                                                    <div
                                                        key={tb.id}
                                                        className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                                                    >
                                                        <div>
                                                            <div className="font-bold text-slate-900 dark:text-white">{tb.title}</div>
                                                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                                                Đã xóa:{' '}
                                                                {tb.deleted_at
                                                                    ? new Date(tb.deleted_at).toLocaleDateString('vi-VN')
                                                                    : 'Gần đây'}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleRestoreBoard(tb.id)}
                                                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold cursor-pointer transition"
                                                            >
                                                                <RotateCcw className="w-3.5 h-3.5" /> Khôi phục
                                                            </button>
                                                            <button
                                                                onClick={() => handlePermanentDeleteBoard(tb.id)}
                                                                className="p-1.5 text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 cursor-pointer"
                                                                title="Xóa vĩnh viễn"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2.5 pt-4 mt-3 border-t border-slate-200 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 font-medium transition"
                            >
                                Đóng
                            </button>
                            {settingsTab !== 'trash' && (
                                <button
                                    type="button"
                                    onClick={handleSaveBoardSettings}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer shadow-xs transition"
                                >
                                    Lưu Thiết Lập
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 2. MODAL: TẠO BOARD MỚI */}
            {isNewBoardModalOpen && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsNewBoardModalOpen(false);
                    }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,520px)] p-6 sm:p-7 text-xs text-slate-800 dark:text-slate-200 shadow-2xl relative my-auto"
                    >
                        <button
                            onClick={() => setIsNewBoardModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                            <FolderPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> Tạo Board Mới
                        </h3>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (!newBoardTitle.trim()) return;
                                const res: any = await fetchApi('/board/boards', {
                                    method: 'POST',
                                    body: JSON.stringify({ title: newBoardTitle.trim() })
                                });
                                toast.success(`Đã tạo bảng "${newBoardTitle}"!`);
                                const updated = [...boards, res.data];
                                setBoards(updated);
                                setActiveBoardId(res.data.id);
                                setIsNewBoardModalOpen(false);
                                setNewBoardTitle('');
                            }}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                                    Tên Board <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={newBoardTitle}
                                    onChange={(e) => setNewBoardTitle(e.target.value)}
                                    placeholder="VD: Quản Lý Khách Hàng / RPA..."
                                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none focus:border-indigo-500"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsNewBoardModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer font-medium transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer transition"
                                >
                                    Tạo Board
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 3. MODAL: THÊM / SỬA CỘT */}
            {isColumnModalOpen && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsColumnModalOpen(false);
                    }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,520px)] p-6 sm:p-7 text-xs text-slate-800 dark:text-slate-200 shadow-2xl relative my-auto"
                    >
                        <button
                            onClick={() => setIsColumnModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-3">
                            {editingColumn ? 'Chỉnh Sửa Cột' : 'Thêm Cột Mới'}
                        </h3>
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                if (editingColumn) {
                                    await fetchApi(`/board/columns/${editingColumn.id}`, {
                                        method: 'PUT',
                                        body: JSON.stringify({
                                            title: columnFormTitle,
                                            color: columnFormColor,
                                            column_type: columnFormType
                                        })
                                    });
                                } else {
                                    await fetchApi(`/board/boards/${activeBoardId}/columns`, {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            title: columnFormTitle,
                                            color: columnFormColor,
                                            column_type: columnFormType,
                                            order_index: columns.length
                                        })
                                    });
                                }
                                setIsColumnModalOpen(false);
                                loadBoardData(activeBoardId, true);
                            }}
                            className="space-y-3"
                        >
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Tên Cột</label>
                                <input
                                    type="text"
                                    required
                                    value={columnFormTitle}
                                    onChange={(e) => setColumnFormTitle(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Loại Cột</label>
                                <select
                                    value={columnFormType}
                                    onChange={(e) => setColumnFormType(e.target.value)}
                                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none cursor-pointer"
                                >
                                    <option value="custom" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">📌 Thông thường</option>
                                    <option value="done" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">✓ Hoàn thành (Tích xanh & Mờ dịu)</option>
                                    <option value="abort" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">🚫 Hủy bỏ (Gạch ngang chữ)</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => setIsColumnModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer font-medium transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer transition"
                                >
                                    Lưu Cột
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* 4. MODAL: CHI TIẾT CARD & SUBTASKS */}
            {isCardModalOpen && activeCard && (
                <div
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsCardModalOpen(false);
                    }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-150"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-[min(94vw,760px)] p-6 sm:p-8 text-xs text-slate-800 dark:text-slate-200 shadow-2xl relative max-h-[92vh] flex flex-col my-auto"
                    >
                        <button
                            onClick={() => setIsCardModalOpen(false)}
                            className="absolute right-5 top-5 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <input
                            type="text"
                            value={activeCard.title}
                            onChange={(e) => setActiveCard({ ...activeCard, title: e.target.value })}
                            className="text-base font-bold text-slate-900 dark:text-white bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-indigo-500 outline-none pb-1 mb-4"
                        />

                        <div className="space-y-4 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                            <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-950/70 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Mức độ ưu tiên</label>
                                    <select
                                        value={activeCard.priority}
                                        onChange={(e) => setActiveCard({ ...activeCard, priority: e.target.value })}
                                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold cursor-pointer shadow-xs"
                                    >
                                        {boardPriorities.map((p) => (
                                            <option key={p.key} value={p.key} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                                {p.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Phân loại (Category)</label>
                                    <select
                                        value={activeCard.category || 'Khác'}
                                        onChange={(e) => setActiveCard({ ...activeCard, category: e.target.value })}
                                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white cursor-pointer shadow-xs"
                                    >
                                        {boardCategories.map((cat) => (
                                            <option key={cat} value={cat} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                                                {cat}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Người phụ trách</label>
                                    <input
                                        type="text"
                                        value={activeCard.assigned_name || ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, assigned_name: e.target.value })}
                                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white shadow-xs"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Hạn chót (Ngày & Giờ)</label>
                                    <input
                                        type="datetime-local"
                                        value={activeCard.due_date ? activeCard.due_date.slice(0, 16) : ''}
                                        onChange={(e) =>
                                            setActiveCard({
                                                ...activeCard,
                                                due_date: e.target.value ? new Date(e.target.value).toISOString() : null
                                            })
                                        }
                                        className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-[11px] shadow-xs"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">Mô tả công việc</label>
                                <textarea
                                    rows={3}
                                    value={activeCard.description || ''}
                                    onChange={(e) => setActiveCard({ ...activeCard, description: e.target.value })}
                                    placeholder="Chi tiết công việc..."
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold mb-1 flex justify-between text-slate-700 dark:text-slate-300">
                                    <span>Checklist công việc:</span>
                                    <span className="text-slate-500 dark:text-slate-400">
                                        {(activeCard.subtasks || []).filter((s) => s.completed).length}/
                                        {(activeCard.subtasks || []).length}
                                    </span>
                                </label>
                                <div className="space-y-1.5 mb-2">
                                    {(activeCard.subtasks || []).map((sub) => (
                                        <div key={sub.id} className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                                            <input
                                                type="checkbox"
                                                checked={sub.completed}
                                                onChange={() => {
                                                    const updated = (activeCard.subtasks || []).map((s) =>
                                                        s.id === sub.id ? { ...s, completed: !s.completed } : s
                                                    );
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                                            />
                                            <span className={`flex-1 ${sub.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>
                                                {sub.title}
                                            </span>
                                            <button
                                                onClick={() => {
                                                    const updated = (activeCard.subtasks || []).filter((s) => s.id !== sub.id);
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                                className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
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
                                        placeholder="Thêm đầu việc..."
                                        className="flex-1 p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!newSubtaskTitle.trim()) return;
                                            setActiveCard({
                                                ...activeCard,
                                                subtasks: [
                                                    ...(activeCard.subtasks || []),
                                                    { id: Date.now().toString(), title: newSubtaskTitle.trim(), completed: false }
                                                ]
                                            });
                                            setNewSubtaskTitle('');
                                        }}
                                        className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-bold rounded-xl cursor-pointer shadow-xs"
                                    >
                                        Thêm
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4 mt-3 border-t border-slate-200 dark:border-slate-800">
                            <button
                                type="button"
                                onClick={() => {
                                    if (!activeCard) return;
                                    setConfirmDialog({
                                        isOpen: true,
                                        title: 'Xóa Thẻ Nhiệm Vụ?',
                                        description: `Bạn có chắc chắn muốn xóa thẻ "${activeCard.title}"? Thẻ sau khi xóa sẽ không thể phục hồi.`,
                                        confirmText: 'Xóa Thẻ',
                                        variant: 'danger',
                                        onConfirm: async () => {
                                            try {
                                                await fetchApi(`/board/cards/${activeCard.id}`, { method: 'DELETE' });
                                                const updated = cards.filter((c) => c.id !== activeCard.id);
                                                setCards(updated);
                                                setConfirmDialog(null);
                                                setIsCardModalOpen(false);
                                                toast.success('Đã xóa thẻ nhiệm vụ!');
                                            } catch (err: any) {
                                                toast.error('Lỗi khi xóa thẻ: ' + (err.message || err));
                                            }
                                        }
                                    });
                                }}
                                className="text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold hover:underline cursor-pointer"
                            >
                                Xóa Thẻ
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsCardModalOpen(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 transition"
                                >
                                    Hủy
                                </button>
                                <button
                                    disabled={isSavingCard}
                                    onClick={handleSaveCardDetail}
                                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs cursor-pointer disabled:opacity-50 transition"
                                >
                                    Lưu Thay Đổi
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirm Dialog Modal */}
            {confirmDialog && (
                <ConfirmDialog
                    isOpen={confirmDialog.isOpen}
                    title={confirmDialog.title}
                    description={confirmDialog.description}
                    confirmText={confirmDialog.confirmText}
                    variant={confirmDialog.variant}
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </div>
    );
};