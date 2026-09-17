// frontend/src/features/studio/components/tabs/workspace/ApprovalFlowSection.tsx
import React from 'react';
import { Search, X, BookOpen, Info, Loader2 } from 'lucide-react';
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
    return (
        <div className="space-y-5 pt-2">
            {/* 3 Nút Chọn Sub-flow */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {[
                    { id: 'approve_school_order', label: 'Đơn Hàng Trường', desc: 'Duyệt Order của Trường' },
                    { id: 'approve_partner_contract', label: 'Hợp Đồng Đối Tác', desc: 'Duyệt Contract PRT' },
                    { id: 'admin_approve_contract', label: 'Hợp Đồng Quản Trị', desc: 'Duyệt Contract DST' },
                ].map((sub) => (
                    <button
                        key={sub.id}
                        type="button"
                        onClick={() => {
                            setApproveSubFlow(sub.id as any);
                            setUniversalSearchQuery('');
                            setSelectedItemCode('');
                            setSelectedCachedItem(null);
                            setParsedOrderCourses([]);
                        }}
                        className={`rounded-2xl border p-4 text-left transition-all cursor-pointer ${approveSubFlow === sub.id
                            ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            }`}
                    >
                        <p className={`text-xs font-bold ${approveSubFlow === sub.id ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                            {sub.label}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub.desc}</p>
                    </button>
                ))}
            </div>

            {/* Ô Tìm Kiếm Phổ Quát */}
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                        <Search className="h-3.5 w-3.5 text-indigo-600" />
                        <span>
                            {approveSubFlow === 'approve_school_order' && 'Tìm Kiếm Đơn Hàng (Theo Mã Đơn, Tên Trường, hoặc Tên Đối Tác):'}
                            {approveSubFlow === 'approve_partner_contract' && 'Tìm Kiếm Hợp Đồng (Theo Mã PRT, Tên Đối Tác, hoặc Nhà Phân Phối):'}
                            {approveSubFlow === 'admin_approve_contract' && 'Tìm Kiếm Hợp Đồng (Theo Mã DST, hoặc Tên Nhà Phân Phối):'}
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

            {/* Lý Do Duyệt Sales Admin (Chỉ hiện khi chọn DST) */}
            {approveSubFlow === 'admin_approve_contract' && (
                <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            Lý Do Phê Duyệt Sales Admin: <span className="text-rose-500">* (Tối thiểu 15 ký tự)</span>
                        </label>
                        <span className={`text-[11px] font-mono font-medium ${adminJustification.trim().length >= 15 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {adminJustification.trim().length}/15 ký tự
                        </span>
                    </div>
                    <textarea
                        rows={2}
                        value={adminJustification}
                        onChange={(e) => setAdminJustification(e.target.value)}
                        placeholder="Nhập lý do phê duyệt Sales Admin..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-hidden"
                    />
                </div>
            )}

            {/* Bộ Lọc Trạng Thái Status Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Danh Sách Đơn Hàng ({filteredCacheList.length}/{scrapedPendingList.length}):
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

            {/* Bố Cục Danh Sách & Bảng Chi Tiết Khóa Học */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
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
                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-xs ring-1 ring-indigo-500'
                                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 hover:border-slate-300'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                                                {itemCode}
                                            </span>
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

                {/* Khối Thông Tin Chi Tiết Bên Phải */}
                <div className="lg:col-span-5">
                    <div className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                                <BookOpen className="h-4 w-4 text-indigo-600" />
                                <span>Chi Tiết Khóa Học & Giấy Phép</span>
                            </div>
                            {selectedItemCode && (
                                <span className="font-mono text-[10px] text-slate-400 font-bold">
                                    {selectedItemCode}
                                </span>
                            )}
                        </div>

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
                                    Ghi chú: {selectedCachedItem.notes || 'Không có ghi chú thêm.'}
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