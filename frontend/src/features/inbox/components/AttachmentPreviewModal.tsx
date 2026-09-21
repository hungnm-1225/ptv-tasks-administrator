// frontend/src/features/inbox/components/AttachmentPreviewModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Paperclip,
    Layers,
    FileText,
    Download,
    ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PreviewAttachmentFile, SpreadsheetPreviewData } from '../types';

export const FileSpreadsheetIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className || 'w-4 h-4'}
    >
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M8 13h2" />
        <path d="M14 13h2" />
        <path d="M8 17h2" />
        <path d="M14 17h2" />
    </svg>
);

interface AttachmentPreviewModalProps {
    previewFile: PreviewAttachmentFile | null;
    onClose: () => void;
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
    previewFile,
    onClose,
}) => {
    const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreviewData | null>(null);
    const [spreadsheetPreviewError, setSpreadsheetPreviewError] = useState<string | null>(null);
    const [isSpreadsheetLoading, setIsSpreadsheetLoading] = useState<boolean>(false);

    useEffect(() => {
        let cancelled = false;
        const loadSpreadsheet = async () => {
            setSpreadsheetPreview(null);
            setSpreadsheetPreviewError(null);
            if (!previewFile || !/\.xlsx?$/i.test(previewFile.filename)) return;

            setIsSpreadsheetLoading(true);
            try {
                const response = await fetch(previewFile.url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' });
                const sheetNames = workbook.SheetNames;
                if (!sheetNames || sheetNames.length === 0) throw new Error('Không có worksheet');

                const sheetsData: Record<string, string[][]> = {};
                sheetNames.forEach((sName) => {
                    const ws = workbook.Sheets[sName];
                    if (ws) {
                        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
                            .slice(0, 150)
                            .map((row) => row.slice(0, 40).map((value) => String(value ?? '')));
                        sheetsData[sName] = rows;
                    } else {
                        sheetsData[sName] = [];
                    }
                });

                if (!cancelled) {
                    setSpreadsheetPreview({
                        sheetNames,
                        activeSheet: sheetNames[0],
                        sheetsData,
                    });
                }
            } catch {
                if (!cancelled) {
                    setSpreadsheetPreviewError(
                        'Không thể đọc trực tiếp bảng tính này. Bạn vẫn có thể mở hoặc tải file để đối chiếu.'
                    );
                }
            } finally {
                if (!cancelled) setIsSpreadsheetLoading(false);
            }
        };

        loadSpreadsheet();
        return () => {
            cancelled = true;
        };
    }, [previewFile]);

    if (!previewFile || typeof document === 'undefined') return null;

    const isExcel = previewFile.filename.match(/\.xlsx?$/i);
    const isImage = previewFile.filename.match(/\.(png|jpe?g|webp|gif)$/i);
    const isPdf = previewFile.filename.match(/\.pdf$/i);
    const isOffice = previewFile.filename.match(/\.(docx?|pptx?)$/i);

    return createPortal(
        <div
            onClick={onClose}
            className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-3xl w-full shadow-2xl space-y-4 my-auto flex flex-col max-h-[92vh] ${isExcel
                    ? 'max-w-full sm:max-w-4xl lg:max-w-5xl xl:max-w-6xl p-5 sm:p-7'
                    : 'max-w-full sm:max-w-2xl lg:max-w-3xl p-6'
                    }`}
            >
                {/* Header Modal */}
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0 pr-3">
                        {isExcel ? (
                            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                <FileSpreadsheetIcon className="w-4 h-4" />
                            </div>
                        ) : (
                            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                <Paperclip className="w-4 h-4" />
                            </div>
                        )}
                        <div className="truncate">
                            <span className="text-xs sm:text-sm font-bold truncate text-slate-900 dark:text-slate-100 block">
                                {previewFile.filename}
                            </span>
                            {spreadsheetPreview && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                    Phát hiện {spreadsheetPreview.sheetNames.length} Sheet(s) • Đang xem:{' '}
                                    <b className="text-emerald-600">{spreadsheetPreview.activeSheet}</b>
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Thanh Tab Navigation cho Excel (COF 4-5 Tabs) */}
                {spreadsheetPreview && (
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 scrollbar-thin shrink-0 border-b border-slate-150 dark:border-slate-800/80">
                        <span className="text-[10px] uppercase font-black text-slate-400 pr-1 shrink-0 flex items-center gap-1">
                            <Layers className="w-3 h-3" /> Tabs:
                        </span>
                        {spreadsheetPreview.sheetNames.map((sheet) => {
                            const isActive = sheet === spreadsheetPreview.activeSheet;
                            const rowCount = spreadsheetPreview.sheetsData[sheet]?.length || 0;
                            return (
                                <button
                                    key={sheet}
                                    type="button"
                                    onClick={() =>
                                        setSpreadsheetPreview((prev) => (prev ? { ...prev, activeSheet: sheet } : null))
                                    }
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${isActive
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    <span>{sheet}</span>
                                    <span
                                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-medium ${isActive ? 'bg-emerald-800 text-emerald-100' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                                            }`}
                                    >
                                        {rowCount} dòng
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Vùng Render Nội Dung Tệp */}
                <div className="flex-1 min-h-[300px] max-h-[62vh] overflow-auto bg-slate-50 dark:bg-slate-850/50 rounded-2xl p-4 flex flex-col justify-start">
                    {isImage ? (
                        <div className="flex items-center justify-center h-full">
                            <img
                                src={previewFile.url}
                                alt={previewFile.filename}
                                className="max-h-[55vh] object-contain rounded-xl shadow-sm"
                            />
                        </div>
                    ) : isPdf ? (
                        <iframe
                            title={`Xem trước ${previewFile.filename}`}
                            src={previewFile.url}
                            className="w-full h-[55vh] rounded-xl bg-white"
                        />
                    ) : isExcel && isSpreadsheetLoading ? (
                        <div className="w-full space-y-3 animate-pulse p-2">
                            <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-64" />
                            <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                                <div className="h-10 bg-slate-200 dark:bg-slate-700 w-full" />
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {[1, 2, 3, 4, 5, 6, 7].map((idx) => (
                                        <div
                                            key={idx}
                                            className="h-9 bg-slate-100/60 dark:bg-slate-800/40 w-full flex items-center px-3 gap-3"
                                        >
                                            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                                            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                                            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/4" />
                                            <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-1/6" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : isExcel && spreadsheetPreview ? (
                        <div className="w-full flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center justify-between mb-2 shrink-0">
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    Đang xem Sheet:{' '}
                                    <b className="text-slate-900 dark:text-white font-mono">{spreadsheetPreview.activeSheet}</b>
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">(Tối đa 150 hàng x 40 cột được tải)</span>
                            </div>

                            <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                                <table className="w-full border-collapse text-left text-xs">
                                    <tbody>
                                        {(spreadsheetPreview.sheetsData[spreadsheetPreview.activeSheet] || []).map((row, rowIndex) => (
                                            <tr
                                                key={rowIndex}
                                                className={`${rowIndex === 0
                                                    ? 'sticky top-0 bg-slate-200 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white z-10 shadow-2xs border-b border-slate-300 dark:border-slate-700'
                                                    : rowIndex % 2 === 0
                                                        ? 'bg-white dark:bg-slate-900/60 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                                                        : 'bg-slate-50/70 dark:bg-slate-850 hover:bg-indigo-50/40 dark:hover:bg-slate-800/60'
                                                    }`}
                                            >
                                                <td className="px-2 py-1.5 text-[10px] font-mono font-bold text-slate-400 bg-slate-100/70 dark:bg-slate-800/80 border-r border-slate-200 dark:border-slate-700 select-none text-center w-8">
                                                    {rowIndex + 1}
                                                </td>
                                                {row.map((cell, cellIndex) => (
                                                    <td
                                                        key={cellIndex}
                                                        className="max-w-64 truncate px-3 py-1.5 text-slate-800 dark:text-slate-200 border-b border-r border-slate-200/70 dark:border-slate-750/70"
                                                        title={cell}
                                                    >
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className="mt-2 text-[10px] text-slate-400 shrink-0">
                                💡 Chế độ xem trước trực tiếp: Bấm các tab phía trên để chuyển đổi nhanh giữa các Sheet (Curriculum Order
                                Form, Student Info, Teacher Info...).
                            </p>
                        </div>
                    ) : isOffice ? (
                        <div className="text-center space-y-3 m-auto">
                            <FileText className="w-12 h-12 text-sky-700 mx-auto" />
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                Tài liệu Office cần trình xem của trình duyệt hoặc ứng dụng phù hợp.
                            </p>
                            <a
                                href={`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(previewFile.url)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-700 text-white text-xs font-bold hover:bg-sky-800 transition"
                            >
                                <ExternalLink className="w-4 h-4" /> Mở bằng Office Viewer
                            </a>
                        </div>
                    ) : (
                        <div className="text-center space-y-3 m-auto">
                            <FileSpreadsheetIcon className="w-12 h-12 text-emerald-600 mx-auto" />
                            <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                {spreadsheetPreviewError || 'Định dạng này chưa có trình xem trực tiếp.'}
                            </p>
                            <a
                                href={previewFile.url}
                                target="_blank"
                                rel="noreferrer"
                                download={previewFile.filename}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition"
                            >
                                <Download className="w-4 h-4" />
                                <span>Tải File Về Máy</span>
                            </a>
                        </div>
                    )}
                </div>

                {/* Footer Modal */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                        Khung xem kiểm định an toàn đính kèm (Fail-Closed Review)
                    </span>
                    <div className="flex items-center gap-2 ml-auto">
                        <a
                            href={previewFile.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-300 hover:bg-slate-200 transition flex items-center gap-1.5"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Mở trong Tab Mới</span>
                        </a>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition cursor-pointer"
                        >
                            Đóng
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};