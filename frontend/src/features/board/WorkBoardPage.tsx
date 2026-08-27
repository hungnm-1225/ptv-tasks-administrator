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
    Sliders,
    Tag,
    Flame,
    CheckCircle2,
    Ban,
    RotateCcw,
    UploadCloud
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { BoardItem, BoardColumnItem, BoardCardItem, BoardSubtask, BoardPriorityItem } from '../../types';

const PRESET_OVERLAYS = [
    { name: 'Đen Mờ (Dark)', color: '#000000' },
    { name: 'Trắng Sáng (Light)', color: '#ffffff' },
    { name: 'Xanh Navy (Deep Blue)', color: '#0f172a' },
    { name: 'Indigo Đậm (Deep Indigo)', color: '#1e1b4b' },
    { name: 'Xám Khói (Slate)', color: '#334155' }
];

// ⚡ TRỢ THỦ PERSISTENT STORAGE (LƯU LOCALSTORAGE - HIỂN THỊ TỨC THÌ 0MS)
const getBoardLocalCache = <T,>(key: string): T | null => {
    try {
        const raw = localStorage.getItem(`ptv_wb_${key}`);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const setBoardLocalCache = (key: string, data: any) => {
    try {
        localStorage.setItem(`ptv_wb_${key}`, JSON.stringify(data));
    } catch { }
};

export const WorkBoardPage: React.FC = () => {
    // ⚡ KHỞI TẠO STATE NGAY TỪ LOCALSTORAGE (0MS TUYỆT ĐỐI)
    const initialBoards = useMemo(() => getBoardLocalCache<BoardItem[]>('boards_list') || [], []);
    const initialActiveId = useMemo(() => {
        const savedId = getBoardLocalCache<string>('active_id');
        if (savedId && initialBoards.some(b => b.id === savedId)) return savedId;
        const defaultB = initialBoards.find(b => b.is_default) || initialBoards[0];
        return defaultB ? defaultB.id : '';
    }, [initialBoards]);

    const initialColumns = useMemo(() => {
        return initialActiveId ? (getBoardLocalCache<BoardColumnItem[]>(`cols_${initialActiveId}`) || []) : [];
    }, [initialActiveId]);

    const initialCards = useMemo(() => {
        return initialActiveId ? (getBoardLocalCache<BoardCardItem[]>(`cards_${initialActiveId}`) || []) : [];
    }, [initialActiveId]);

    const [boards, setBoards] = useState<BoardItem[]>(initialBoards);
    const [trashBoards, setTrashBoards] = useState<BoardItem[]>(() => getBoardLocalCache<BoardItem[]>('trash_list') || []);
    const [activeBoardId, setActiveBoardId] = useState<string>(initialActiveId);
    const [columns, setColumns] = useState<BoardColumnItem[]>(initialColumns);
    const [cards, setCards] = useState<BoardCardItem[]>(initialCards);
    const [isLoading, setIsLoading] = useState<boolean>(initialColumns.length === 0);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [filterCategory, setFilterCategory] = useState<string>('all');

    // Drag & Drop
    const [draggedCardId, setDraggedCardId] = useState<string | null>(null);

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

    // Quick Add State (Mặc định Thấp & Khác)
    const [quickAddColId, setQuickAddColId] = useState<string | null>(null);
    const [quickAddTitle, setQuickAddTitle] = useState<string>('');
    const [quickAddPriority, setQuickAddPriority] = useState<string>('low');
    const [quickAddCategory, setQuickAddCategory] = useState<string>('Khác');

    // Board Settings Temporary State
    const [boardOverlayColor, setBoardOverlayColor] = useState<string>('#000000');
    const [boardOverlayOpacity, setBoardOverlayOpacity] = useState<number>(0.35);
    const [boardColumnOpacity, setBoardColumnOpacity] = useState<number>(0.75);
    const [boardCardOpacity, setBoardCardOpacity] = useState<number>(0.85);
    const [newCategoryInput, setNewCategoryInput] = useState<string>('');
    const [isUploadingBg, setIsUploadingBg] = useState<boolean>(false);

    const bgFileInputRef = useRef<HTMLInputElement>(null);

    // ⚡ 1. SWR TẢI BOARDS NGẦM
    const loadBoards = useCallback(async () => {
        try {
            const [activeData, trashData] = await Promise.all([
                fetchApi<BoardItem[]>('/board/boards'),
                fetchApi<BoardItem[]>('/board/boards/trash')
            ]);
            setBoards(activeData);
            setTrashBoards(trashData);
            setBoardLocalCache('boards_list', activeData);
            setBoardLocalCache('trash_list', trashData);

            if (activeData.length > 0) {
                if (!activeBoardId || !activeData.some(b => b.id === activeBoardId)) {
                    const defaultB = activeData.find(b => b.is_default) || activeData[0];
                    setActiveBoardId(defaultB.id);
                    setBoardLocalCache('active_id', defaultB.id);
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

    // ⚡ 2. SWR TẢI CỘT & THẺ NGẦM (KHÔNG HIỆN LOADING NẾU ĐÃ CÓ CACHE)
    const loadBoardData = useCallback(async (boardId: string, forceSpinner = false) => {
        if (!boardId) return;

        const cachedCols = getBoardLocalCache<BoardColumnItem[]>(`cols_${boardId}`);
        const cachedCards = getBoardLocalCache<BoardCardItem[]>(`cards_${boardId}`);

        if (cachedCols && cachedCards && !forceSpinner) {
            setColumns(cachedCols);
            setCards(cachedCards);
            setIsLoading(false);
        } else if (forceSpinner) {
            setIsLoading(true);
        }

        try {
            const [colsData, cardsData] = await Promise.all([
                fetchApi<BoardColumnItem[]>(`/board/boards/${boardId}/columns`),
                fetchApi<BoardCardItem[]>(`/board/boards/${boardId}/cards`)
            ]);
            setColumns(colsData);
            setCards(cardsData);
            setBoardLocalCache(`cols_${boardId}`, colsData);
            setBoardLocalCache(`cards_${boardId}`, cardsData);
        } catch (err: any) {
            if (!cachedCols) {
                toast.error('Lỗi tải dữ liệu bảng: ' + (err.message || err));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeBoardId) {
            setBoardLocalCache('active_id', activeBoardId);
            loadBoardData(activeBoardId);
            const curBoard = boards.find(b => b.id === activeBoardId);
            if (curBoard) {
                setBoardOverlayColor(curBoard.overlay_color || '#000000');
                setBoardOverlayOpacity(curBoard.overlay_opacity ?? 0.35);
                setBoardColumnOpacity(curBoard.column_opacity ?? 0.75);
                setBoardCardOpacity(curBoard.card_opacity ?? 0.85);
            }
        }
    }, [activeBoardId, loadBoardData, boards]);

    const activeBoard = useMemo(() => boards.find(b => b.id === activeBoardId), [boards, activeBoardId]);

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

    // 4. Xử lý Drag & Drop Thẻ
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

        // Giữ nguyên 100% logic thông báo của anh
        if (targetCol?.column_type === 'done') {
            toast.success(`✓ Đã hoàn thành công việc: "${targetCard.title}"`);
        } else if (targetCol?.column_type === 'abort') {
            toast.error(`🚫 Đã hủy/tạm dừng: "${targetCard.title}"`);
        } else {
            toast.info(`Đã chuyển sang [${targetCol?.title}]`);
        }

        const updatedCards = cards.map(c => c.id === draggedCardId ? { ...c, column_id: targetColumnId } : c);
        setCards(updatedCards);
        setBoardLocalCache(`cards_${activeBoardId}`, updatedCards);
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
                    priority: quickAddPriority,
                    category: quickAddCategory,
                    color: '#8b5cf6',
                    assigned_name: 'Hùng Nguyễn Mạnh'
                })
            });

            toast.success('Đã thêm thẻ mới!');
            const updated = [res.data, ...cards];
            setCards(updated);
            setBoardLocalCache(`cards_${activeBoardId}`, updated);
            setQuickAddTitle('');
            setQuickAddColId(null);
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

            const updatedBoards = boards.map(b => b.id === activeBoardId ? { ...b, background_url: publicUrl } : b);
            setBoards(updatedBoards);
            setBoardLocalCache('boards_list', updatedBoards);
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

            const updatedBoards = boards.map(b => b.id === activeBoardId ? {
                ...b,
                overlay_color: boardOverlayColor,
                overlay_opacity: boardOverlayOpacity,
                column_opacity: boardColumnOpacity,
                card_opacity: boardCardOpacity,
                categories: boardCategories,
                priorities: boardPriorities
            } : b);

            setBoards(updatedBoards);
            setBoardLocalCache('boards_list', updatedBoards);
            toast.success('Đã lưu toàn bộ thiết lập Board!');
            setIsSettingsModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu cài đặt: ' + (err.message || err));
        }
    };

    // 8. Xóa Board (Soft Delete)
    const handleSoftDeleteBoard = async () => {
        if (!activeBoardId) return;
        if (!window.confirm(`Chuyển bảng "${activeBoard?.title}" vào Thùng rác? (Bảng sẽ tự động xóa vĩnh viễn sau 30 ngày).`)) return;

        try {
            await fetchApi(`/board/boards/${activeBoardId}`, { method: 'DELETE' });
            toast.success('Đã chuyển bảng vào Thùng rác.');
            setIsSettingsModalOpen(false);
            loadBoards();
        } catch (err: any) {
            toast.error('Lỗi xóa bảng: ' + (err.message || err));
        }
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
    const handlePermanentDeleteBoard = async (bId: string) => {
        if (!window.confirm('Hành động này sẽ XÓA VĨNH VIỄN toàn bộ Cột và Thẻ của bảng này và không thể phục hồi. Anh có chắc không?')) return;
        try {
            await fetchApi(`/board/boards/${bId}/permanent`, { method: 'DELETE' });
            toast.success('Đã xóa vĩnh viễn bảng.');
            loadBoards();
        } catch (err: any) {
            toast.error('Lỗi xóa vĩnh viễn: ' + (err.message || err));
        }
    };

    // 11. Lưu Card Chi Tiết
    const handleSaveCardDetail = async () => {
        if (!activeCard) return;
        setIsSavingCard(true);
        try {
            const res: any = await fetchApi(`/board/cards/${activeCard.id}`, {
                method: 'PUT',
                body: JSON.stringify(activeCard)
            });
            toast.success('Đã lưu thay đổi thẻ!');
            const updated = cards.map(c => c.id === activeCard.id ? res.data : c);
            setCards(updated);
            setBoardLocalCache(`cards_${activeBoardId}`, updated);
            setIsCardModalOpen(false);
        } catch (err: any) {
            toast.error('Lỗi lưu thẻ: ' + (err.message || err));
        } finally {
            setIsSavingCard(false);
        }
    };

    const hexToRgba = (hex: string, opacity: number) => {
        let c = hex.replace('#', '');
        if (c.length === 3) c = c.split('').map(x => x + x).join('');
        const num = parseInt(c, 16);
        return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${opacity})`;
    };

    return (
        <div className="relative w-full h-[calc(100vh-64px)] flex flex-col overflow-hidden bg-slate-950">
            {/* 🖼️ Lớp Hình Nền + Lớp Phủ Màu Mờ Tùy Chỉnh (0-100%) */}
            {activeBoard?.background_url && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-all"
                    style={{ backgroundImage: `url(${activeBoard.background_url})` }}
                />
            )}
            <div
                className="absolute inset-0 transition-all pointer-events-none"
                style={{
                    backgroundColor: activeBoard?.overlay_color || '#000000',
                    opacity: activeBoard?.overlay_opacity ?? 0.35
                }}
            />

            {/* Content Container */}
            <div className="relative z-10 w-full h-full flex flex-col p-4 space-y-3">
                {/* Top Control Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-ink/80 backdrop-blur-md p-3 rounded-2xl border border-rule-2 shadow-xl text-xs">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Board Selector */}
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-accent" />
                            <select
                                value={activeBoardId}
                                onChange={(e) => setActiveBoardId(e.target.value)}
                                className="px-3 py-1.5 bg-ink border border-rule-2 rounded-xl text-xs font-bold text-primary-ink outline-none cursor-pointer focus:ring-2 focus:ring-accent"
                            >
                                {boards.map(b => (
                                    <option key={b.id} value={b.id}>📋 {b.title}</option>
                                ))}
                            </select>
                        </div>

                        {/* Nút Tạo Board */}
                        <button
                            onClick={() => setIsNewBoardModalOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-ink hover:bg-primary text-ink-2 rounded-xl border border-rule-2 transition-colors cursor-pointer"
                        >
                            <FolderPlus className="w-3.5 h-3.5 text-accent" />
                            Tạo Board
                        </button>

                        {/* Nút Cài Đặt Chuyên Sâu */}
                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-ink hover:bg-primary text-ink-2 rounded-xl border border-rule-2 transition-colors cursor-pointer"
                        >
                            <Sliders className="w-3.5 h-3.5 text-mint" />
                            Tùy Chỉnh Board
                        </button>

                        {/* Nút Thêm Cột */}
                        <button
                            onClick={() => {
                                setEditingColumn(null);
                                setColumnFormTitle('');
                                setColumnFormColor('oklch(58% 0.140 220)');
                                setColumnFormType('custom');
                                setIsColumnModalOpen(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-accent hover:bg-accent-2 text-accent-ink font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Thêm Cột
                        </button>
                    </div>

                    {/* Search & Filters */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Tìm thẻ..."
                                className="pl-8 pr-3 py-1.5 bg-ink/90 border border-rule-2 rounded-xl text-xs text-primary-ink placeholder-ink-3 outline-none w-36 focus:w-48 transition-all"
                            />
                        </div>

                        {/* Lọc Priority */}
                        <select
                            value={filterPriority}
                            onChange={(e) => setFilterPriority(e.target.value)}
                            className="px-2.5 py-1.5 bg-ink border border-rule-2 rounded-xl text-xs text-ink outline-none cursor-pointer"
                        >
                            <option value="all">⚡ Tất cả Priority</option>
                            {boardPriorities.map(p => (
                                <option key={p.key} value={p.key}>{p.label}</option>
                            ))}
                        </select>

                        {/* Lọc Category */}
                        <select
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value)}
                            className="px-2.5 py-1.5 bg-ink border border-rule-2 rounded-xl text-xs text-ink outline-none cursor-pointer"
                        >
                            <option value="all">🏷️ Tất cả Phân loại</option>
                            {boardCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Kanban Board Columns Area */}
                <div className="flex-1 flex gap-3.5 items-start overflow-x-auto pb-2">
                    {columns.map(col => {
                        const colCards = filteredCards.filter(c => c.column_id === col.id);
                        const isDoneCol = col.column_type === 'done';
                        const isAbortCol = col.column_type === 'abort';

                        return (
                            <div
                                key={col.id}
                                onDragOver={handleDragOver}
                                onDrop={() => handleDrop(col.id)}
                                className="w-72 shrink-0 p-3 rounded-2xl border border-rule-2 flex flex-col max-h-[calc(100vh-160px)] shadow-xl transition-all"
                                style={{
                                    backgroundColor: hexToRgba('#0f172a', activeBoard?.column_opacity ?? 0.75),
                                    borderTop: `3px solid ${col.color}`
                                }}
                            >
                                {/* Header Cột */}
                                <div className="flex items-center justify-between mb-2.5 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                                        <h3 className="text-xs font-bold text-primary-ink truncate max-w-[130px]">{col.title}</h3>
                                        <span className="px-1.5 py-0.5 rounded-md bg-paper-2 text-[10px] font-bold text-ink-2">
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
                                            className="p-1 hover:bg-paper-2 text-ink-2 hover:text-primary-ink rounded-md cursor-pointer"
                                        >
                                            <Settings2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                setQuickAddColId(col.id);
                                                setQuickAddTitle('');
                                                setQuickAddPriority('low');
                                                setQuickAddCategory('Khác');
                                            }}
                                            className="p-1 hover:bg-paper-2 text-ink-2 hover:text-primary-ink rounded-md cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Ô Thêm Nhanh Thẻ */}
                                {quickAddColId === col.id && (
                                    <div className="bg-ink/90 p-2.5 rounded-xl border border-accent mb-2.5 text-xs space-y-2 animate-in fade-in">
                                        <textarea
                                            rows={2}
                                            autoFocus
                                            value={quickAddTitle}
                                            onChange={(e) => setQuickAddTitle(e.target.value)}
                                            placeholder="Nhập tiêu đề thẻ công việc..."
                                            className="w-full p-1.5 bg-ink border border-rule-2 rounded-lg text-primary-ink outline-none text-xs"
                                        />

                                        <div className="grid grid-cols-2 gap-1.5">
                                            <select
                                                value={quickAddPriority}
                                                onChange={(e) => setQuickAddPriority(e.target.value)}
                                                className="p-1 bg-ink border border-rule-2 rounded text-[11px] text-ink outline-none cursor-pointer"
                                            >
                                                {boardPriorities.map(p => (
                                                    <option key={p.key} value={p.key}>{p.label}</option>
                                                ))}
                                            </select>

                                            <select
                                                value={quickAddCategory}
                                                onChange={(e) => setQuickAddCategory(e.target.value)}
                                                className="p-1 bg-ink border border-rule-2 rounded text-[11px] text-ink outline-none cursor-pointer"
                                            >
                                                {boardCategories.map(cat => (
                                                    <option key={cat} value={cat}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="flex items-center justify-end gap-1.5 pt-1">
                                            <button
                                                onClick={() => setQuickAddColId(null)}
                                                className="px-2 py-1 text-[11px] text-ink-3 hover:text-ink cursor-pointer"
                                            >
                                                Hủy
                                            </button>
                                            <button
                                                onClick={() => handleQuickAddCard(col.id)}
                                                className="px-3 py-1 bg-accent text-accent-ink rounded-lg text-[11px] font-semibold hover:bg-accent-2 cursor-pointer"
                                            >
                                                Thêm Thẻ
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Danh Sách Thẻ */}
                                <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
                                    {colCards.length === 0 && quickAddColId !== col.id && (
                                        <div className="py-12 text-center text-ink-3 text-[11px] border border-dashed border-rule-2 rounded-xl">
                                            Kéo thả thẻ vào đây
                                        </div>
                                    )}

                                    {colCards.map(card => {
                                        const subtasks = card.subtasks || [];
                                        const completedSubtasks = subtasks.filter(s => s.completed).length;
                                        const priorityObj = boardPriorities.find(p => p.key === card.priority) || { label: card.priority, color: '#64748b' };

                                        return (
                                            <div
                                                key={card.id}
                                                draggable
                                                onDragStart={() => handleDragStart(card.id)}
                                                onClick={() => {
                                                    setActiveCard({ ...card, subtasks: card.subtasks || [] });
                                                    setIsCardModalOpen(true);
                                                }}
                                                className={`p-3.5 rounded-xl border border-rule-2 shadow-md hover:shadow-xl transition-all cursor-grab active:cursor-grabbing group relative ${isDoneCol ? 'opacity-75 bg-mint-soft border-mint' :
                                                    isAbortCol ? 'opacity-65 bg-rose-soft border-rose' : ''
                                                    }`}
                                                style={{
                                                    backgroundColor: isDoneCol || isAbortCol ? undefined : hexToRgba('#1e293b', activeBoard?.card_opacity ?? 0.85),
                                                    borderLeft: `4px solid ${isDoneCol ? 'oklch(72% 0.120 158)' : isAbortCol ? 'oklch(65% 0.180 15)' : (card.color || 'oklch(58% 0.140 220)')}`
                                                }}
                                            >
                                                {/* Priority & Category Badges */}
                                                <div className="flex items-center justify-between gap-1 mb-2">
                                                    <span
                                                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-primary-ink"
                                                        style={{ backgroundColor: priorityObj.color + '40', color: priorityObj.color }}
                                                    >
                                                        {priorityObj.label}
                                                    </span>

                                                    <span className="text-[10px] font-mono text-ink-3 bg-ink px-1.5 py-0.5 rounded">
                                                        {card.category || 'Khác'}
                                                    </span>
                                                </div>

                                                {/* Tiêu đề */}
                                                <div className="flex items-start gap-1.5 mb-2">
                                                    {isDoneCol && <CheckCircle2 className="w-3.5 h-3.5 text-mint shrink-0 mt-0.5" />}
                                                    {isAbortCol && <Ban className="w-3.5 h-3.5 text-rose shrink-0 mt-0.5" />}
                                                    <h4 className={`text-xs font-bold text-primary-ink leading-snug line-clamp-2 ${isDoneCol ? 'text-ink-2' : isAbortCol ? 'line-through text-ink-3' : ''
                                                        }`}>
                                                        {card.title}
                                                    </h4>
                                                </div>

                                                {/* Subtasks Progress */}
                                                {subtasks.length > 0 && (
                                                    <div className="flex items-center gap-1.5 text-[10px] text-ink-3 mb-2">
                                                        <CheckSquare className="w-3 h-3 text-accent" />
                                                        <span>{completedSubtasks}/{subtasks.length}</span>
                                                        <div className="flex-1 bg-rule-2 h-1.5 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-accent h-full rounded-full"
                                                                style={{ width: `${(completedSubtasks / subtasks.length) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Footer */}
                                                <div className="flex items-center justify-between pt-2 border-t border-rule-2 text-[10px] text-ink-3">
                                                    <span className="flex items-center gap-1 truncate max-w-[120px]">
                                                        <User className="w-3 h-3" />
                                                        {card.assigned_name || 'Admin'}
                                                    </span>
                                                    {card.due_date && (
                                                        <span className="flex items-center gap-1 text-ink-2 font-mono">
                                                            <Clock className="w-3 h-3" />
                                                            {new Date(card.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
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
            </div>

            {/* MODAL: TÙY CHỈNH BOARD */}
            {isSettingsModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay animate-in fade-in">
                    <div className="bg-ink border border-rule-2 rounded-2xl max-w-xl w-full p-6 text-xs text-primary-ink shadow-2xl relative max-h-[90vh] flex flex-col">
                        <button
                            onClick={() => setIsSettingsModalOpen(false)}
                            className="absolute right-4 top-4 text-ink-2 hover:text-primary-ink cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-base font-bold text-primary-ink mb-2 flex items-center gap-2">
                            <Sliders className="w-5 h-5 text-mint" />
                            Tùy Chỉnh Toàn Diện – [{activeBoard?.title}]
                        </h3>

                        {/* 3 Tabs Điều Khiển */}
                        <div className="flex bg-ink-3 p-1 rounded-xl mb-4 text-xs">
                            <button
                                type="button"
                                onClick={() => setSettingsTab('visuals')}
                                className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${settingsTab === 'visuals' ? 'bg-primary text-primary-ink' : 'text-ink-2'
                                    }`}
                            >
                                🎨 Hình Nền & Độ Mờ
                            </button>
                            <button
                                type="button"
                                onClick={() => setSettingsTab('taxonomy')}
                                className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${settingsTab === 'taxonomy' ? 'bg-primary text-primary-ink' : 'text-ink-2'
                                    }`}
                            >
                                🏷️ Phân Loại & Priority
                            </button>
                            <button
                                type="button"
                                onClick={() => setSettingsTab('trash')}
                                className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${settingsTab === 'trash' ? 'bg-primary text-primary-ink' : 'text-ink-2'
                                    }`}
                            >
                                🗑️ Thùng Rác Board ({trashBoards.length})
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                            {settingsTab === 'visuals' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block font-semibold mb-1">Ảnh Nền Board:</label>
                                        <input type="file" ref={bgFileInputRef} onChange={handleUploadBgFile} accept="image/*" className="hidden" />
                                        <div
                                            onClick={() => !isUploadingBg && bgFileInputRef.current?.click()}
                                            className="border border-dashed border-rule-2 hover:border-mint p-4 rounded-xl text-center cursor-pointer bg-paper-2/50"
                                        >
                                            {isUploadingBg ? (
                                                <span className="text-accent flex items-center justify-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải lên Supabase...
                                                </span>
                                            ) : (
                                                <span className="text-ink-2 flex items-center justify-center gap-2">
                                                    <UploadCloud className="w-4 h-4 text-mint" /> Bấm để chọn ảnh nền mới từ máy tính
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block font-semibold mb-1">Màu Lớp Phủ (Overlay Color):</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {PRESET_OVERLAYS.map(ov => (
                                                <button
                                                    key={ov.name}
                                                    type="button"
                                                    onClick={() => setBoardOverlayColor(ov.color)}
                                                    className={`px-3 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${boardOverlayColor === ov.color ? 'border-mint bg-mint-soft text-mint' : 'border-rule-2 bg-ink text-ink-2'
                                                        }`}
                                                >
                                                    {ov.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="bg-paper-2/60 p-3.5 rounded-xl border border-rule-2 space-y-3">
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <span className="font-semibold">Độ mờ tối của Lớp Phủ Board:</span>
                                                <span className="font-mono text-mint">{Math.round(boardOverlayOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value={boardOverlayOpacity}
                                                onChange={(e) => setBoardOverlayOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-mint cursor-pointer"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <span className="font-semibold">Độ trong suốt nền Cột (Columns):</span>
                                                <span className="font-mono text-accent">{Math.round(boardColumnOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={boardColumnOpacity}
                                                onChange={(e) => setBoardColumnOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-accent cursor-pointer"
                                            />
                                        </div>

                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <span className="font-semibold">Độ trong suốt nền Thẻ (Cards):</span>
                                                <span className="font-mono text-accent-2">{Math.round(boardCardOpacity * 100)}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min="0.2"
                                                max="1"
                                                step="0.05"
                                                value={boardCardOpacity}
                                                onChange={(e) => setBoardCardOpacity(parseFloat(e.target.value))}
                                                className="w-full accent-accent cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'taxonomy' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block font-semibold mb-1.5">Danh sách Phân Loại (Categories) áp dụng cho Board:</label>
                                        <div className="flex flex-wrap gap-1.5 mb-2">
                                            {boardCategories.map((cat, idx) => (
                                                <span key={idx} className="flex items-center gap-1 px-2.5 py-1 bg-ink border border-rule-2 rounded-lg text-primary-ink">
                                                    {cat}
                                                    {boardCategories.length > 1 && (
                                                        <button
                                                            onClick={() => {
                                                                const updated = boardCategories.filter((_, i) => i !== idx);
                                                                setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, categories: updated } : b));
                                                            }}
                                                            className="text-ink-2 hover:text-rose cursor-pointer"
                                                        >
                                                            <X className="w-3 h-3" />
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
                                                className="flex-1 p-2 bg-ink border border-rule-2 rounded-xl text-primary-ink outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!newCategoryInput.trim()) return;
                                                    const updated = [...boardCategories, newCategoryInput.trim()];
                                                    setBoards(prev => prev.map(b => b.id === activeBoardId ? { ...b, categories: updated } : b));
                                                    setNewCategoryInput('');
                                                }}
                                                className="px-3 py-2 bg-accent text-accent-ink rounded-xl font-semibold cursor-pointer"
                                            >
                                                Thêm
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {settingsTab === 'trash' && (
                                <div className="space-y-4">
                                    <div className="p-3 bg-rose-soft border border-rose rounded-xl flex items-center justify-between">
                                        <div>
                                            <h4 className="font-bold text-rose">Xóa Bảng Hiện Tại</h4>
                                            <p className="text-[11px] text-ink-2">Bảng sẽ chuyển vào Thùng rác và lưu trữ an toàn trong 30 ngày.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleSoftDeleteBoard}
                                            className="px-3 py-1.5 bg-rose text-rose-soft font-semibold rounded-lg cursor-pointer"
                                        >
                                            Xóa Bảng Này
                                        </button>
                                    </div>

                                    <div>
                                        <h4 className="font-bold mb-2 text-ink-2">Danh sách Bảng trong Thùng rác (Tự hủy sau 30 ngày):</h4>
                                        {trashBoards.length === 0 ? (
                                            <div className="p-6 text-center text-ink-2 bg-ink rounded-xl">Thùng rác trống.</div>
                                        ) : (
                                            <div className="space-y-2">
                                                {trashBoards.map(tb => (
                                                    <div key={tb.id} className="p-2.5 bg-ink rounded-xl border border-rule-2 flex items-center justify-between">
                                                        <div>
                                                            <div className="font-bold text-primary-ink">{tb.title}</div>
                                                            <div className="text-[10px] text-ink-2">
                                                                Đã xóa: {tb.deleted_at ? new Date(tb.deleted_at).toLocaleDateString('vi-VN') : 'Gần đây'}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleRestoreBoard(tb.id)}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-mint-soft text-mint hover:bg-mint rounded-lg text-[11px] cursor-pointer"
                                                            >
                                                                <RotateCcw className="w-3 h-3" /> Khôi phục
                                                            </button>
                                                            <button
                                                                onClick={() => handlePermanentDeleteBoard(tb.id)}
                                                                className="p-1 text-rose hover:text-rose-soft cursor-pointer"
                                                                title="Xóa vĩnh viễn"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
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

                        <div className="flex justify-end gap-2 pt-4 mt-3 border-t border-rule-2">
                            <button
                                type="button"
                                onClick={() => setIsSettingsModalOpen(false)}
                                className="px-4 py-2 bg-ink text-ink-2 rounded-xl cursor-pointer"
                            >
                                Đóng
                            </button>
                            {settingsTab !== 'trash' && (
                                <button
                                    type="button"
                                    onClick={handleSaveBoardSettings}
                                    className="px-4 py-2 bg-mint text-ink font-semibold rounded-xl cursor-pointer"
                                >
                                    Lưu Thiết Lập
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: TẠO BOARD MỚI */}
            {isNewBoardModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs">
                    <div className="bg-ink border border-rule-2 rounded-2xl max-w-md w-full p-6 text-xs text-primary-ink">
                        <h3 className="text-base font-bold text-primary-ink mb-3 flex items-center gap-2">
                            <FolderPlus className="w-5 h-5 text-accent" /> Tạo Board Mới
                        </h3>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (!newBoardTitle.trim()) return;
                            const res: any = await fetchApi('/board/boards', {
                                method: 'POST',
                                body: JSON.stringify({ title: newBoardTitle.trim() })
                            });
                            toast.success(`Đã tạo bảng "${newBoardTitle}"!`);
                            const updated = [...boards, res.data];
                            setBoards(updated);
                            setBoardLocalCache('boards_list', updated);
                            setActiveBoardId(res.data.id);
                            setBoardLocalCache('active_id', res.data.id);
                            setIsNewBoardModalOpen(false);
                            setNewBoardTitle('');
                        }} className="space-y-4">
                            <div>
                                <label className="block font-semibold mb-1">Tên Board <span className="text-rose">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={newBoardTitle}
                                    onChange={(e) => setNewBoardTitle(e.target.value)}
                                    placeholder="VD: Quản Lý Khách Hàng / RPA..."
                                    className="w-full p-2.5 bg-paper-2 border border-rule-2 rounded-xl text-ink outline-none"
                                />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setIsNewBoardModalOpen(false)} className="px-4 py-2 bg-paper-2 text-ink-2 rounded-xl cursor-pointer">Hủy</button>
                                <button type="submit" className="px-4 py-2 bg-accent text-accent-ink font-semibold rounded-xl cursor-pointer">Tạo Board</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: THÊM / SỬA CỘT */}
            {isColumnModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs">
                    <div className="bg-ink border border-rule-2 rounded-2xl max-w-md w-full p-6 text-xs text-primary-ink">
                        <h3 className="text-base font-bold text-primary-ink mb-3">
                            {editingColumn ? 'Chỉnh Sửa Cột' : 'Thêm Cột Mới'}
                        </h3>
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            if (editingColumn) {
                                await fetchApi(`/board/columns/${editingColumn.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ title: columnFormTitle, color: columnFormColor, column_type: columnFormType })
                                });
                            } else {
                                await fetchApi(`/board/boards/${activeBoardId}/columns`, {
                                    method: 'POST',
                                    body: JSON.stringify({ title: columnFormTitle, color: columnFormColor, column_type: columnFormType, order_index: columns.length })
                                });
                            }
                            setIsColumnModalOpen(false);
                            loadBoardData(activeBoardId, true);
                        }} className="space-y-3">
                            <div>
                                <label className="block font-semibold mb-1">Tên Cột</label>
                                <input
                                    type="text"
                                    required
                                    value={columnFormTitle}
                                    onChange={(e) => setColumnFormTitle(e.target.value)}
                                    className="w-full p-2 bg-paper-2 border border-rule-2 rounded-xl text-ink outline-none"
                                />
                            </div>
                            <div>
                                <label className="block font-semibold mb-1">Loại Cột</label>
                                <select
                                    value={columnFormType}
                                    onChange={(e) => setColumnFormType(e.target.value)}
                                    className="w-full p-2 bg-paper-2 border border-rule-2 rounded-xl text-ink outline-none cursor-pointer"
                                >
                                    <option value="custom">📌 Thông thường</option>
                                    <option value="done">✓ Hoàn thành (Tích xanh & Mờ dịu)</option>
                                    <option value="abort">🚫 Hủy bỏ (Gạch ngang chữ)</option>
                                </select>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsColumnModalOpen(false)} className="px-4 py-2 bg-paper-2 rounded-xl text-ink-2 cursor-pointer">Hủy</button>
                                <button type="submit" className="px-4 py-2 bg-accent text-accent-ink font-semibold rounded-xl cursor-pointer">Lưu Cột</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: CHI TIẾT CARD */}
            {isCardModalOpen && activeCard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs">
                    <div className="bg-ink border border-rule-2 rounded-2xl max-w-xl w-full p-6 text-xs text-primary-ink relative max-h-[90vh] flex flex-col">
                        <button onClick={() => setIsCardModalOpen(false)} className="absolute right-4 top-4 text-ink-2 hover:text-primary-ink cursor-pointer">
                            <X className="w-5 h-5" />
                        </button>

                        <input
                            type="text"
                            value={activeCard.title}
                            onChange={(e) => setActiveCard({ ...activeCard, title: e.target.value })}
                            className="text-base font-bold text-primary-ink bg-transparent border-b border-rule-2 focus:border-accent outline-none pb-1 mb-4"
                        />

                        <div className="space-y-4 flex-1 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-3 bg-paper-2/60 p-3 rounded-xl border border-rule-2">
                                <div>
                                    <label className="block text-[11px] font-semibold text-ink-2 mb-1">Mức độ ưu tiên</label>
                                    <select
                                        value={activeCard.priority}
                                        onChange={(e) => setActiveCard({ ...activeCard, priority: e.target.value })}
                                        className="w-full p-1.5 bg-ink border border-rule-2 rounded-lg text-primary-ink font-bold cursor-pointer"
                                    >
                                        {boardPriorities.map(p => (
                                            <option key={p.key} value={p.key}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-ink-2 mb-1">Phân loại (Category)</label>
                                    <select
                                        value={activeCard.category || 'Khác'}
                                        onChange={(e) => setActiveCard({ ...activeCard, category: e.target.value })}
                                        className="w-full p-1.5 bg-ink border border-rule-2 rounded-lg text-primary-ink cursor-pointer"
                                    >
                                        {boardCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-ink-2 mb-1">Người phụ trách</label>
                                    <input
                                        type="text"
                                        value={activeCard.assigned_name || ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, assigned_name: e.target.value })}
                                        className="w-full p-1.5 bg-ink border border-rule-2 rounded-lg text-primary-ink"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-ink-2 mb-1">Hạn chót (Ngày & Giờ)</label>
                                    <input
                                        type="datetime-local"
                                        value={activeCard.due_date ? activeCard.due_date.slice(0, 16) : ''}
                                        onChange={(e) => setActiveCard({ ...activeCard, due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                                        className="w-full p-1.5 bg-ink border border-rule-2 rounded-lg text-primary-ink font-mono text-[11px]"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold mb-1">Mô tả công việc</label>
                                <textarea
                                    rows={3}
                                    value={activeCard.description || ''}
                                    onChange={(e) => setActiveCard({ ...activeCard, description: e.target.value })}
                                    placeholder="Chi tiết công việc..."
                                    className="w-full p-2 bg-paper-2 border border-rule-2 rounded-xl text-ink outline-none"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold mb-1 flex justify-between">
                                    <span>Checklist công việc:</span>
                                    <span className="text-ink-2">{(activeCard.subtasks || []).filter(s => s.completed).length}/{(activeCard.subtasks || []).length}</span>
                                </label>
                                <div className="space-y-1.5 mb-2">
                                    {(activeCard.subtasks || []).map(sub => (
                                        <div key={sub.id} className="flex items-center gap-2 p-2 bg-paper-2 rounded-lg">
                                            <input
                                                type="checkbox"
                                                checked={sub.completed}
                                                onChange={() => {
                                                    const updated = (activeCard.subtasks || []).map(s => s.id === sub.id ? { ...s, completed: !s.completed } : s);
                                                    setActiveCard({ ...activeCard, subtasks: updated });
                                                }}
                                            />
                                            <span className={`flex-1 ${sub.completed ? 'line-through text-ink-2' : 'text-primary-ink'}`}>{sub.title}</span>
                                            <button onClick={() => {
                                                const updated = (activeCard.subtasks || []).filter(s => s.id !== sub.id);
                                                setActiveCard({ ...activeCard, subtasks: updated });
                                            }} className="text-ink-2 hover:text-rose cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newSubtaskTitle}
                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                        placeholder="Thêm đầu việc..."
                                        className="flex-1 p-2 bg-paper-2 border border-rule-2 rounded-xl text-ink outline-none"
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
                                        className="px-3 py-2 bg-paper-2 text-primary-ink rounded-xl cursor-pointer"
                                    >
                                        Thêm
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between pt-4 mt-3 border-t border-rule-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!window.confirm('Xóa thẻ này?')) return;
                                    await fetchApi(`/board/cards/${activeCard.id}`, { method: 'DELETE' });
                                    const updated = cards.filter(c => c.id !== activeCard.id);
                                    setCards(updated);
                                    setBoardLocalCache(`cards_${activeBoardId}`, updated);
                                    setIsCardModalOpen(false);
                                }}
                                className="text-rose font-semibold cursor-pointer"
                            >
                                Xóa Thẻ
                            </button>
                            <div className="flex gap-2">
                                <button onClick={() => setIsCardModalOpen(false)} className="px-4 py-2 bg-paper-2 text-ink-2 rounded-xl cursor-pointer">Hủy</button>
                                <button disabled={isSavingCard} onClick={handleSaveCardDetail} className="px-4 py-2 bg-accent text-accent-ink font-semibold rounded-xl cursor-pointer">
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