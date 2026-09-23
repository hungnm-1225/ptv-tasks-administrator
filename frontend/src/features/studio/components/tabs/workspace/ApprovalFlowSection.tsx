// frontend/src/features/studio/components/tabs/workspace/ApprovalFlowSection.tsx
import React from 'react';
import { Search, X, BookOpen, Info, Loader2, GitCommit, School, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ScrapedPendingItem } from '../../../types';

interface ApprovalFlowSectionProps {
    approveSubFlow: 'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract';
    setApproveSubFlow: (val: 'approve_school_order' | 'approve_partner_contract' | 'admin_approve_contract') => void;
    universalSearchQuery: string;
    setUniversalSearchQuery: (val: string) => void;
    selectedItemCode: string;
    setSelectedItemCode: (val: string) => void;
    selectedCachedItem: ScrapedPendingItem | null;
    setSelectedCachedItem: (item: ScrapedPendingItem | null) => void;
    parsedOrderCourses: any[];
    setParsedOrderCourses: (courses: any[]) => void;
    adminJustification: string;
    setAdminJustification: (val: string) => void;
    statusFilter: 'pending' | 'approved' | 'rejected' | 'all';
    setStatusFilter: (val: 'pending' | 'approved' | 'rejected' | 'all') => void;
    scrapedPendingList: ScrapedPendingItem[];
    filteredCacheList: ScrapedPendingItem[];
    isScrapingLive: boolean;
    onLoadOrderDetails: (orderCode: string, schoolName?: string) => Promise<void>;
}

export const ApprovalFlowSection: React.FC<ApprovalFlowSectionProps> = ({
    approveSubFlow,
    setApproveSubFlow,
    universalSearchQuery,
    setUniversalSearchQuery,
    selectedItemCode,
    setSelectedItemCode,
    selectedCachedItem,
    setSelectedCachedItem,
    parsedOrderCourses,
    setParsedOrderCourses,
    adminJustification,
    setAdminJustification,
    statusFilter,
    setStatusFilter,
    scrapedPendingList,
    filteredCacheList,
    isScrapingLive,
    onLoadOrderDetails,
}) => {
    // 🎯 HÀM BÓC TÁCH CHUỖI PHẢ HỆ CẤP BÙ TỰ ĐỘNG TỪ GHI CHÚ
    const parseTopupLineage = (notesStr?: string) => {
        if (!notesStr) return null;
        const isTopup = notesStr.includes('CẤP BÙ') || notesStr.includes('TOPUP');
        if (!isTopup) return null;

        const orderMatch = notesStr.match(/ORDER:\s*([A-Za-z0-9-_]+)/i);
        const prtMatch = notesStr.match(/PRT:\s*([A-Za-z0-9-_]+)/i);
        const schoolMatch = notesStr.match(/TRƯỜNG:\s*([^\]|]+)/i);

        return {
            originOrder: orderMatch ? orderMatch[1].trim() : null,
            originPrt: prtMatch ? prtMatch[1].trim() : null,
            schoolName: schoolMatch ? schoolMatch[1].trim() : null,
            rawNotes: notesStr,
        };
    };

    const currentLineage = selectedCachedItem ? parseTopupLineage(selectedCachedItem.notes) : null;

    return (
        <div className="space-y-5 pt-2">
            {/* 1. KHU VỰC PHÂN CHIA SUB-FLOW: TÁCH RIÊNG SALES ADMIN */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* 1.1. Partner Duyệt */}
                <button
                    type="button"
                    onClick={() => {
                        setApproveSubFlow('approve_school_order');
                        setUniversalSearchQuery('');
                        setSelectedItemCode('');
                        setSelectedCachedItem(null);
                        setParsedOrderCourses([]);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${approveSubFlow === 'approve_school_order'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Đơn Hàng Trường (SCH)</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            Partner Duyệt
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Cấp phép License trực tiếp từ License Pool của Partner.
                    </p>
                </button>

                {/* 1.2. Distributor Duyệt */}
                <button
                    type="button"
                    onClick={() => {
                        setApproveSubFlow('approve_partner_contract');
                        setUniversalSearchQuery('');
                        setSelectedItemCode('');
                        setSelectedCachedItem(null);
                        setParsedOrderCourses([]);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${approveSubFlow === 'approve_partner_contract'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">Hợp Đồng Đối Tác (PRT)</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            NPP Duyệt
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                        Duyệt cấp bù hạn ngạch cho Partner khi kho bị thiếu.
                    </p>
                </button>

                {/* 1.3. 👑 SALES ADMIN EXECUTIVE PORTAL (TÁCH BIỆT HOÀNG GIA) */}
                <button
                    type="button"
                    onClick={() => {
                        setApproveSubFlow('admin_approve_contract');
                        setUniversalSearchQuery('');
                        setSelectedItemCode('');
                        setSelectedCachedItem(null);
                        setParsedOrderCourses([]);
                    }}
                    className={`rounded-2xl border p-4 text-left transition-all cursor-pointer relative overflow-hidden ${approveSubFlow === 'admin_approve_contract'
                        ? 'border-amber-500 bg-amber-50/90 dark:bg-amber-950/50 ring-2 ring-amber-400 shadow-sm'
                        : 'border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 hover:bg-amber-50/60'
                        }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-amber-950 dark:text-amber-200 flex items-center gap-1.5">
                            <span>👑</span>
                            <span>Sales Admin Executive</span>
                        </span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                            Tối Cao DST
                        </span>
                    </div>
                    <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-1 font-medium">
                        Phê duyệt cấp ngân sách hạn ngạch NPP toàn hệ thống.
                    </p>
                </button>
            </div>

            {/* 2. Ô TÌM KIẾM PHỔ QUÁT */}
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-indigo-600" />
                        <span>
                            {approveSubFlow === 'approve_school_order' && 'Tìm Kiếm Đơn Hàng (SCH, Tên Trường, hoặc Đối Tác):'}
                            {approveSubFlow === 'approve_partner_contract' && 'Tìm Kiếm Hợp Đồng Đối Tác (PRT, Tên Đối Tác, hoặc NPP):'}
                            {approveSubFlow === 'admin_approve_contract' && 'Tìm Kiếm Hợp Đồng NPP Quản Trị (DST, Tên NPP):'}
                        </span>
                    </span>
                    {selectedItemCode && (
                        <span className="text-xs text-indigo-600 font-mono font-bold">
                            Đang chọn: {selectedItemCode}
                        </span>
                    )}
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={universalSearchQuery}
                        onChange={(e) => setUniversalSearchQuery(e.target.value)}
                        placeholder="Gõ từ khóa để lọc danh sách bên dưới (VD: SCH-..., PRT-..., DST-...)"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden transition-all"
                    />
                    {universalSearchQuery && (
                        <button
                            type="button"
                            onClick={() => setUniversalSearchQuery('')}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* 3. CONFIRMATION NOTE: CHỈ HIỆN KHI SALES ADMIN DUYỆT DST CONTRACT */}
            {approveSubFlow === 'admin_approve_contract' && (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <span>👑</span>
                            <span>Sales Admin Confirmation Note: <span className="text-rose-500">* (Tối thiểu 15 ký tự)</span></span>
                        </label>
                        <span className={`text-[11px] font-mono font-medium ${adminJustification.trim().length >= 15 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {adminJustification.trim().length}/15 ký tự
                        </span>
                    </div>
                    <textarea
                        rows={2}
                        value={adminJustification}
                        onChange={(e) => setAdminJustification(e.target.value)}
                        placeholder="Nhập Confirmation Note / Căn cứ phê duyệt cấp hạn ngạch License của Sales Admin..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-amber-500 focus:outline-hidden resize-none"
                    />
                </div>
            )}

            {/* 4. BỘ LỌC TRẠNG THÁI */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Danh Sách Yêu Cầu ({filteredCacheList.length}/{scrapedPendingList.length}):
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[
                        { id: 'pending', label: '⏳ Chờ duyệt' },
                        { id: 'approved', label: '✅ Đã duyệt' },
                        { id: 'rejected', label: '❌ Bị từ chối' },
                        { id: 'all', label: '📑 Tất cả' },
                    ].map((st) => (
                        <button
                            key={st.id}
                            type="button"
                            onClick={() => setStatusFilter(st.id as any)}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer ${statusFilter === st.id
                                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 font-semibold ring-1 ring-indigo-300/60'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                }`}
                        >
                            <span>{st.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* 5. BỐ CỤC DANH SÁCH & BẢNG CHI TIẾT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* 5.1. DANH SÁCH BÊN TRÁI */}
                <div className="lg:col-span-7 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {isScrapingLive && scrapedPendingList.length === 0 ? (
                        <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            <span>Đang nạp danh sách từ Cache...</span>
                        </div>
                    ) : filteredCacheList.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
                            Không tìm thấy đơn hàng hoặc hợp đồng phù hợp với điều kiện tìm kiếm.
                        </div>
                    ) : (
                        filteredCacheList.map((item, pIdx) => {
                            const itemCode = item.order_code || item.contract_code || item.data_id || `ITEM-${pIdx}`;
                            const isSelected = selectedItemCode === itemCode;
                            const isPending =
                                (item.status || '').toLowerCase().includes('pending') ||
                                (item.status || '').toLowerCase().includes('awaiting');

                            // Nhận diện xem đơn này có phải đơn cấp bù tự động hay không
                            const lineageInfo = parseTopupLineage(item.notes);

                            return (
                                <div
                                    key={pIdx}
                                    onClick={() => {
                                        setSelectedItemCode(itemCode);
                                        setSelectedCachedItem(item);
                                        if (approveSubFlow === 'approve_school_order') {
                                            if (item.courses_data && item.courses_data.length > 0) {
                                                setParsedOrderCourses(item.courses_data);
                                            } else {
                                                onLoadOrderDetails(itemCode, item.school_name);
                                            }
                                        } else {
                                            if (item.courses_data && item.courses_data.length > 0) {
                                                setParsedOrderCourses(item.courses_data);
                                            } else {
                                                setParsedOrderCourses([]);
                                            }
                                        }
                                        toast.success(`Đã chọn: ${itemCode}`);
                                    }}
                                    className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${isSelected
                                        ? approveSubFlow === 'admin_approve_contract'
                                            ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 shadow-xs ring-1 ring-amber-400'
                                            : 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs ring-1 ring-indigo-500'
                                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                                    {itemCode}
                                                </span>
                                                {/* BADGE BÁO HIỆU ĐƠN CẤP BÙ */}
                                                {lineageInfo && (
                                                    <span className="px-2 py-0.2 rounded-full text-[9px] font-mono font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
                                                        ⚡ Cấp bù: {lineageInfo.originOrder || lineageInfo.originPrt}
                                                    </span>
                                                )}
                                            </div>

                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                {item.school_name || item.sender_name || 'Đơn vị gửi'}
                                            </p>
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                <span>{item.partner_name || item.sender_name}</span>
                                                <span>➔</span>
                                                <span>{item.distributor_name || item.receiver_name}</span>
                                                <span>|</span>
                                                <span className="font-mono">{item.order_date || item.contract_date || item.created_at}</span>
                                            </div>
                                        </div>

                                        <span
                                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${isPending
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                                                }`}
                                        >
                                            {item.status || 'Chờ duyệt'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 5.2. KHỐI CHI TIẾT BÊN PHẢI (KÈM THẺ PHẢ HỆ LINEAGE) */}
                <div className="lg:col-span-5">
                    <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-3.5">
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                                <BookOpen className="h-4 w-4 text-indigo-600" />
                                <span>Chi Tiết Giấy Phép & Nguồn Gốc</span>
                            </div>
                            {selectedItemCode && (
                                <span className="font-mono text-[10px] text-slate-400 font-bold">
                                    {selectedItemCode}
                                </span>
                            )}
                        </div>

                        {/* 🌟 THẺ TRUY VẾT PHẢ HỆ CẤP BÙ (LINEAGE PROVENANCE CARD) */}
                        {currentLineage && (
                            <div className="rounded-xl border border-amber-300/80 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-extrabold text-amber-950 dark:text-amber-200 flex items-center gap-1.5 uppercase tracking-wider">
                                        <GitCommit className="w-3.5 h-3.5 text-amber-600" />
                                        <span>Phả Hệ Cấp Bù Tự Động (Provenance)</span>
                                    </span>
                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                </div>

                                <div className="space-y-1.5 text-xs">
                                    {currentLineage.originOrder && (
                                        <div className="flex items-center gap-2 p-1.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200/60 dark:border-amber-900/40">
                                            <School className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-900 dark:text-white truncate">
                                                    Đơn Trường Gốc: <span className="font-mono text-indigo-600">{currentLineage.originOrder}</span>
                                                </p>
                                                {currentLineage.schoolName && (
                                                    <p className="text-[10px] text-slate-500 truncate">{currentLineage.schoolName}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {currentLineage.originPrt && (
                                        <div className="flex items-center gap-1.5 pl-3 text-[10px] text-slate-400 font-mono">
                                            <ArrowRight className="w-3 h-3 text-amber-500" />
                                            <span>Qua hợp đồng đối tác: <b>{currentLineage.originPrt}</b></span>
                                        </div>
                                    )}

                                    <div className="p-2 rounded-lg bg-amber-100/50 dark:bg-amber-900/20 text-[10px] text-amber-900 dark:text-amber-300 font-mono">
                                        {currentLineage.rawNotes}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* DANH SÁCH KHÓA HỌC */}
                        {parsedOrderCourses.length > 0 ? (
                            <div className="space-y-2">
                                {parsedOrderCourses.map((course, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 p-3 text-xs border border-slate-100 dark:border-slate-800 shadow-2xs"
                                    >
                                        <div>
                                            <p className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[190px]">
                                                {course.course_name || course.name}
                                            </p>
                                            <p className="text-slate-400 font-mono text-[10px]">
                                                Phân loại: {course.category}
                                            </p>
                                        </div>
                                        <span className="rounded-lg bg-indigo-50 dark:bg-indigo-950 px-2.5 py-1 font-bold font-mono text-indigo-700 dark:text-indigo-300 text-xs">
                                            {course.licenses || course.quantity} licenses
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : selectedCachedItem ? (
                            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-1.5 text-xs">
                                <p className="font-bold text-slate-900 dark:text-white">
                                    {selectedCachedItem.school_name || selectedItemCode}
                                </p>
                                <p className="text-[11px] text-slate-500">
                                    Ghi chú hệ thống: {selectedCachedItem.notes || 'Không có ghi chú thêm.'}
                                </p>
                            </div>
                        ) : (
                            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
                                <Info className="h-6 w-6 text-slate-300 mb-2" />
                                <span>Vui lòng click chọn 1 đơn hàng/hợp đồng từ danh sách trên để xem chi tiết.</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};