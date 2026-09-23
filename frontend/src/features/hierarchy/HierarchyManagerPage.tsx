import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    Network, Building2, ShieldCheck, ShieldAlert, Search, Filter,
    Edit3, KeyRound, Eye, EyeOff, RefreshCw, Layers, School, Check, X, ArrowRight,
    ChevronLeft, ChevronRight, Plus, Sparkles
} from 'lucide-react';
import { fetchApi } from '../../lib/api';
import { toast } from 'sonner';

interface OrganizationItem {
    id: string;
    code: string;
    name: string;
    role_type: 'distributor' | 'partner' | 'school';
    parent_id: string | null;
    parent_name: string;
    parent_code: string;
    distributor_id: string | null;
    distributor_name: string;
    country: string;
    username: string;
    has_vault_pass: boolean;
    vault_updated_at: string | null;
    drive_folder_url: string | null;
}

interface HierarchyResponse {
    status: string;
    total: number;
    organizations: OrganizationItem[];
    distributors: Array<{ id: string; name: string; code: string }>;
    partners: Array<{ id: string; name: string; code: string; parent_id: string }>;
}

export const HierarchyManagerPage: React.FC = () => {
    const [data, setData] = useState<HierarchyResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRole, setSelectedRole] = useState<string>('all');
    const [selectedCountry, setSelectedCountry] = useState<string>('all');
    const [selectedPartnerFilter, setSelectedPartnerFilter] = useState<string>('all');

    const [countriesList, setCountriesList] = useState<Array<{ code: string; name: string; flag_emoji: string }>>([]);

    // 🎯 State phân trang Local (Client-side Pagination)
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(20);

    // =========================================================================
    // STATE MODAL CHỈNH SỬA (EDIT)
    // =========================================================================
    const [editingOrg, setEditingOrg] = useState<OrganizationItem | null>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        code: '',
        parent_id: '',
        username: '',
        password: '',
        country: '',
        drive_folder_url: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoadingPassword, setIsLoadingPassword] = useState(false);

    // =========================================================================
    // STATE MODAL THÊM MỚI (CREATE)
    // =========================================================================
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createRoleType, setCreateRoleType] = useState<'school' | 'partner' | 'distributor'>('school');
    const [createForm, setCreateForm] = useState({
        name: '',
        code: '',
        parent_id: '',
        username: '',
        password: '',
        country: 'Vietnam',
        drive_folder_url: ''
    });
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Tải danh mục quốc gia & phả hệ
    useEffect(() => {
        fetchApi<any[]>('/workspace/countries')
            .then(res => { if (res) setCountriesList(res); })
            .catch(() => { });
        loadHierarchyData();
    }, []);

    // Tải dữ liệu từ Backend
    const loadHierarchyData = async (showToast = false) => {
        try {
            if (showToast) setRefreshing(true);
            const res = await fetchApi<HierarchyResponse>('/workspace/hierarchy-manage');
            setData(res);
            if (showToast) toast.success('Đã làm tươi dữ liệu phả hệ thành công!');
        } catch (err: any) {
            toast.error(err.message || 'Không thể tải dữ liệu phả hệ');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // 🎯 Mở modal chỉnh sửa & tự động nạp mật khẩu đã giải mã từ Két Sắt
    const handleOpenEdit = async (org: OrganizationItem) => {
        setEditingOrg(org);

        const safeCountry = (org.country && org.country !== 'Unknown')
            ? org.country
            : (countriesList[0]?.name || 'Vietnam');

        setEditForm({
            name: org.name,
            code: org.code === 'N/A' ? '' : org.code,
            parent_id: org.parent_id || '',
            username: org.username || '',
            password: '',
            country: safeCountry,
            drive_folder_url: org.drive_folder_url || ''
        });
        setShowPassword(false);

        // Nếu tổ chức này đã có mật khẩu trong Vault -> Tự động kéo mật khẩu đã giải mã về
        if (org.has_vault_pass) {
            setIsLoadingPassword(true);
            try {
                const res = await fetchApi<{ password: string }>(`/workspace/organizations/${org.id}/vault-password`);
                if (res?.password) {
                    setEditForm(prev => ({ ...prev, password: res.password }));
                }
            } catch {
                console.debug('Không thể tải trước mật khẩu vault');
            } finally {
                setIsLoadingPassword(false);
            }
        }
    };

    // Lưu chỉnh sửa phả hệ & mật khẩu Két Sắt
    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingOrg) return;

        try {
            setIsSubmitting(true);
            await fetchApi(`/workspace/organizations/${editingOrg.id}`, {
                method: 'PUT',
                body: JSON.stringify(editForm)
            });

            toast.success(`Đã cập nhật phả hệ của "${editForm.name}" thành công!`);
            setEditingOrg(null);
            await loadHierarchyData(false);
        } catch (err: any) {
            toast.error(err.message || 'Lỗi khi cập nhật phả hệ');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 🎯 Mở modal Thêm Mới
    const handleOpenCreate = (role: 'school' | 'partner' | 'distributor' = 'school') => {
        setCreateRoleType(role);
        setCreateForm({
            name: '',
            code: '',
            parent_id: '',
            username: '',
            password: '',
            country: countriesList[0]?.name || 'Vietnam',
            drive_folder_url: ''
        });
        setShowCreatePassword(false);
        setIsCreateOpen(true);
    };

    // Tự sinh mật khẩu an toàn ngẫu nhiên
    const generateRandomPassword = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let generated = 'Ptv@';
        for (let i = 0; i < 8; i++) {
            generated += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return generated;
    };

    // Lưu tạo mới đơn vị
    const handleSaveCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.name.trim()) {
            toast.error('Vui lòng nhập tên đơn vị / tổ chức');
            return;
        }

        try {
            setIsCreating(true);
            const payload = {
                ...createForm,
                role_type: createRoleType,
                parent_id: createForm.parent_id || null
            };

            await fetchApi('/workspace/organizations', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            toast.success(`Đã tạo mới ${createRoleType.toUpperCase()}: "${createForm.name}" thành công!`);
            setIsCreateOpen(false);
            await loadHierarchyData(false);
        } catch (err: any) {
            toast.error(err.message || 'Lỗi khi tạo mới đơn vị');
        } finally {
            setIsCreating(false);
        }
    };

    // Lọc dữ liệu hiển thị
    const filteredOrgs = useMemo(() => {
        if (!data?.organizations) return [];
        return data.organizations.filter(org => {
            const matchSearch = searchQuery === '' ||
                org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                org.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                org.parent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                org.distributor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                org.username.toLowerCase().includes(searchQuery.toLowerCase());

            const matchRole = selectedRole === 'all' || org.role_type === selectedRole;
            const matchCountry = selectedCountry === 'all' || org.country.toLowerCase() === selectedCountry.toLowerCase();
            const matchPartner = selectedPartnerFilter === 'all' || org.parent_id === selectedPartnerFilter;

            return matchSearch && matchRole && matchCountry && matchPartner;
        });
    }, [data, searchQuery, selectedRole, selectedCountry, selectedPartnerFilter]);

    // Khi lọc hoặc đổi page size thì reset về trang 1
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedRole, selectedCountry, selectedPartnerFilter, pageSize]);

    // 🎯 Danh sách sau khi cắt theo Trang (Pagination Slicing)
    const totalPages = Math.ceil(filteredOrgs.length / pageSize) || 1;
    const paginatedOrgs = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filteredOrgs.slice(start, start + pageSize);
    }, [filteredOrgs, currentPage, pageSize]);

    // Thống kê nhanh
    const stats = useMemo(() => {
        if (!data?.organizations) return { schools: 0, partners: 0, distributors: 0, vaultReady: 0 };
        return {
            schools: data.organizations.filter(o => o.role_type === 'school').length,
            partners: data.organizations.filter(o => o.role_type === 'partner').length,
            distributors: data.organizations.filter(o => o.role_type === 'distributor').length,
            vaultReady: data.organizations.filter(o => o.has_vault_pass).length
        };
    }, [data]);

    return (
        <div className="space-y-6">
            {/* Header Bento Title */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#131B2B] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                            <Network className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                                Quản lý thông tin tài khoản và đơn vị trực thuộc
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Quản trị và phân cấp 3 tầng (Distributor ➔ Partner ➔ School) kết hợp Két Sắt Fernet Vault
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Nút Thêm Mới */}
                    <button
                        onClick={() => handleOpenCreate('school')}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 active:scale-95 cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        Thêm Đơn Vị Mới
                    </button>

                    {/* Nút Làm Mới */}
                    <button
                        onClick={() => loadHierarchyData(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-all border border-slate-200 dark:border-slate-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Làm mới
                    </button>
                </div>
            </div>

            {/* Bento Grid KPI Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Trường Học (School)</span>
                        <div className="p-2 bg-sky-50 dark:bg-sky-950/50 text-sky-600 rounded-lg">
                            <School className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                        {loading ? <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : stats.schools}
                    </div>
                </div>

                <div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Đối Tác (Partner)</span>
                        <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-lg">
                            <Layers className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                        {loading ? <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : stats.partners}
                    </div>
                </div>

                <div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nhà Phân Phối (Distributor)</span>
                        <div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 rounded-lg">
                            <Building2 className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">
                        {loading ? <div className="h-8 w-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" /> : stats.distributors}
                    </div>
                </div>

                <div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tài khoản có Vault</span>
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-lg">
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {loading ? (
                            <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
                        ) : (
                            <>
                                {stats.vaultReady} <span className="text-xs text-slate-400 font-normal">/ {data?.total || 0}</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white dark:bg-[#131B2B] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Tìm theo tên trường, mã trường, đối tác, username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                </div>

                {/* Role Type Filter */}
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        <option value="all">Tất cả cấp bậc</option>
                        <option value="school">Trường học (School)</option>
                        <option value="partner">Đối tác (Partner)</option>
                        <option value="distributor">Nhà phân phối (Distributor)</option>
                    </select>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-white dark:bg-[#131B2B] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30">
                                <th className="py-3.5 px-4">Tổ Chức / Đơn Vị</th>
                                <th className="py-3.5 px-4">Cấp Bậc</th>
                                <th className="py-3.5 px-4">Trực thuộc</th>
                                <th className="py-3.5 px-4">Username / Email</th>
                                <th className="py-3.5 px-4 text-right">Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
                            {/* 🌟 SKELETON LOADING STATE CHO DANH SÁCH */}
                            {loading ? (
                                Array.from({ length: pageSize > 20 ? 10 : pageSize }).map((_, idx) => (
                                    <tr key={`skeleton-${idx}`} className="animate-pulse">
                                        <td className="py-4 px-4">
                                            <div className="h-4 w-44 bg-slate-200 dark:bg-slate-800 rounded-md mb-2" />
                                            <div className="h-3 w-28 bg-slate-100 dark:bg-slate-800/60 rounded" />
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="h-5 w-16 bg-slate-200 dark:bg-slate-800 rounded-full" />
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="h-4 w-36 bg-slate-200 dark:bg-slate-800 rounded-md" />
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="h-4 w-28 bg-slate-200 dark:bg-slate-800 rounded-md" />
                                        </td>
                                        <td className="py-4 px-4 text-right">
                                            <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded-xl ml-auto" />
                                        </td>
                                    </tr>
                                ))
                            ) : paginatedOrgs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400">
                                        Không tìm thấy đơn vị nào khớp với tiêu chí lọc.
                                    </td>
                                </tr>
                            ) : (
                                paginatedOrgs.map((org) => {
                                    const isSchool = org.role_type === 'school';
                                    const isPartner = org.role_type === 'partner';

                                    return (
                                        <tr key={org.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                            {/* Name & Code */}
                                            <td className="py-3.5 px-4">
                                                <div className="font-semibold text-slate-900 dark:text-white">
                                                    {org.name}
                                                </div>
                                                <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                                                    <span>ID: {org.code}</span>
                                                    <span>•</span>
                                                    <span>{org.country}</span>
                                                </div>
                                            </td>

                                            {/* Role Badge */}
                                            <td className="py-3.5 px-4">
                                                {isSchool && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50">
                                                        School
                                                    </span>
                                                )}
                                                {isPartner && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
                                                        Partner
                                                    </span>
                                                )}
                                                {org.role_type === 'distributor' && (
                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50">
                                                        Distributor
                                                    </span>
                                                )}
                                            </td>

                                            {/* Parent Lineage */}
                                            <td className="py-3.5 px-4">
                                                {isSchool && (
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                                                            {org.distributor_name}
                                                        </span>
                                                        <ArrowRight className="w-3 h-3 text-slate-400" />
                                                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                                                            {org.parent_name}
                                                        </span>
                                                    </div>
                                                )}
                                                {isPartner && (
                                                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                                        <Building2 className="w-3.5 h-3.5" />
                                                        <span>Trực thuộc: {org.parent_name}</span>
                                                    </div>
                                                )}
                                                {org.role_type === 'distributor' && (
                                                    <span className="text-xs text-slate-400 italic">Admin</span>
                                                )}
                                            </td>

                                            {/* Username & Vault Status */}
                                            <td className="py-3.5 px-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-slate-600 dark:text-slate-300">
                                                        {org.username || <span className="text-slate-400 italic">Chưa cấu hình</span>}
                                                    </span>
                                                    {org.has_vault_pass ? (
                                                        <></>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md border border-rose-200/50 dark:border-rose-900/50" title="Chưa cấu hình mật khẩu trong két sắt">
                                                            <ShieldAlert className="w-3 h-3" />
                                                            Thiếu thông tin
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Edit Action Button */}
                                            <td className="py-3.5 px-4 text-right">
                                                <button
                                                    onClick={() => handleOpenEdit(org)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-semibold transition-all border border-indigo-200/60 dark:border-indigo-800/60 active:scale-95 cursor-pointer"
                                                >
                                                    <Edit3 className="w-3.5 h-3.5" />
                                                    Chỉnh sửa
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* 🎯 BENTO LOCAL PAGINATION TOOLBAR */}
                {!loading && filteredOrgs.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-2">
                            <span>Hiển thị</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                                {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredOrgs.length)}
                            </span>
                            <span>trên tổng số</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{filteredOrgs.length}</span>
                            <span>đơn vị</span>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Chọn số dòng hiển thị */}
                            <div className="flex items-center gap-1.5">
                                <span>Số dòng:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => setPageSize(Number(e.target.value))}
                                    className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
                                >
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>

                            {/* Điều hướng trang */}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                    title="Trang trước"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>

                                <span className="px-3 py-1 font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                    {currentPage} / {totalPages}
                                </span>

                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                                    title="Trang sau"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* 🌟 MODAL THÊM MỚI ĐƠN VỊ (CREATE ORG PORTAL)                             */}
            {/* ========================================================================= */}
            {isCreateOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
                    onClick={() => setIsCreateOpen(false)}
                >
                    <div
                        style={{ width: '100%', maxWidth: '34rem' }}
                        className="bg-white dark:bg-[#131B2B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-xl">
                                    <Plus className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">
                                        Thêm mới đơn vị / tổ chức
                                    </h3>
                                    <p className="text-xs text-slate-500">Khởi tạo thực thể mới và lưu mã hóa vào Fernet Vault</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCreateOpen(false)}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleSaveCreate} className="p-5 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
                            {/* Chọn cấp bậc Role Type */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                                    Cấp Bậc Thực Thể <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCreateRoleType('school');
                                            setCreateForm(prev => ({ ...prev, parent_id: '' }));
                                        }}
                                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${createRoleType === 'school'
                                                ? 'bg-sky-50 border-sky-400 text-sky-700 dark:bg-sky-950/60 dark:border-sky-700 dark:text-sky-300 shadow-sm'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                                            }`}
                                    >
                                        <School className="w-4 h-4 text-sky-500" />
                                        Trường Học
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCreateRoleType('partner');
                                            setCreateForm(prev => ({ ...prev, parent_id: '' }));
                                        }}
                                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${createRoleType === 'partner'
                                                ? 'bg-indigo-50 border-indigo-400 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-700 dark:text-indigo-300 shadow-sm'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                                            }`}
                                    >
                                        <Layers className="w-4 h-4 text-indigo-500" />
                                        Đối Tác
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setCreateRoleType('distributor');
                                            setCreateForm(prev => ({ ...prev, parent_id: '' }));
                                        }}
                                        className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${createRoleType === 'distributor'
                                                ? 'bg-amber-50 border-amber-400 text-amber-700 dark:bg-amber-950/60 dark:border-amber-700 dark:text-amber-300 shadow-sm'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400'
                                            }`}
                                    >
                                        <Building2 className="w-4 h-4 text-amber-500" />
                                        Nhà Phân Phối
                                    </button>
                                </div>
                            </div>

                            {/* Tên tổ chức */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Tên đơn vị / trường học <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="VD: Trường Quốc Tế ABC, Đối tác XYZ..."
                                    value={createForm.name}
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            {/* Mã code */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Mã định danh (ID / Code)
                                </label>
                                <input
                                    type="text"
                                    value={createForm.code}
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, code: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    placeholder="VD: 10267, PRT_VN_05, DST_MY..."
                                />
                            </div>

                            {/* Quốc gia */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Quốc Gia Trực Thuộc <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <select
                                    value={createForm.country}
                                    onChange={(e) => setCreateForm(prev => ({ ...prev, country: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                >
                                    {(countriesList.length > 0 ? countriesList : [
                                        { code: 'VN', name: 'Vietnam', flag_emoji: '🇻🇳' },
                                        { code: 'MY', name: 'Malaysia', flag_emoji: '🇲🇾' },
                                        { code: 'ID', name: 'Indonesia', flag_emoji: '🇮🇩' },
                                        { code: 'PH', name: 'Philippines', flag_emoji: '🇵🇭' },
                                    ]).map(c => (
                                        <option key={c.code} value={c.name}>
                                            {c.flag_emoji} {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Gán đơn vị cha theo role */}
                            {createRoleType === 'school' && (
                                <div>
                                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                                        Đối Tác Quản Lý (Partner)
                                    </label>
                                    <select
                                        value={createForm.parent_id}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, parent_id: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                    >
                                        <option value="">-- Trực tiếp (Không qua Partner) --</option>
                                        {data?.partners.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} ({p.code || 'N/A'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {createRoleType === 'partner' && (
                                <div>
                                    <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                                        Nhà Phân Phối Trực Thuộc (Distributor)
                                    </label>
                                    <select
                                        value={createForm.parent_id}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, parent_id: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
                                    >
                                        <option value="">-- Trực tiếp Master --</option>
                                        {data?.distributors.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} ({d.code || 'N/A'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Drive Folder nếu là Distributor */}
                            {createRoleType === 'distributor' && (
                                <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 space-y-1.5">
                                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                        <span>📁 Thư Mục Google Drive Của Distributor:</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={createForm.drive_folder_url}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, drive_folder_url: e.target.value }))}
                                        placeholder="https://drive.google.com/drive/folders/1BxiMVs..."
                                        className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    />
                                </div>
                            )}

                            {/* Két Sắt Khởi Tạo Mật Khẩu */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                                        <KeyRound className="w-4 h-4 text-emerald-500" />
                                        <span>Khởi Tạo Tài Khoản & Két Sắt</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setCreateForm(prev => ({ ...prev, password: generateRandomPassword() }))}
                                        className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 cursor-pointer"
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        Tạo Pass Ngẫu Nhiên
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                        Username / Email đăng nhập
                                    </label>
                                    <input
                                        type="text"
                                        value={createForm.username}
                                        onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        placeholder="VD: school_user@dtt.vn..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                        Mật khẩu khởi tạo
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showCreatePassword ? 'text' : 'password'}
                                            value={createForm.password}
                                            onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                                            className="w-full pl-3 pr-10 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                            placeholder="Nhập hoặc bấm Tạo Pass Ngẫu Nhiên"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCreatePassword(!showCreatePassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                            {showCreatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 active:scale-95 cursor-pointer"
                                >
                                    <Check className="w-4 h-4" />
                                    {isCreating ? 'Đang tạo...' : 'Tạo Đơn Vị Mới'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}

            {/* ========================================================================= */}
            {/* 🌟 MODAL CHỈNH SỬA PHẢ HỆ & KÉT SẮT VAULT (CÓ SKELETON KHI LOAD PASS)    */}
            {/* ========================================================================= */}
            {editingOrg && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
                    onClick={() => setEditingOrg(null)}
                >
                    <div
                        style={{ width: '100%', maxWidth: '32rem' }}
                        className="bg-white dark:bg-[#131B2B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 my-auto flex flex-col max-h-[90vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-xl">
                                    <Edit3 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 dark:text-white">
                                        Chỉnh sửa thông tin
                                    </h3>
                                    <p className="text-xs text-slate-500">{editingOrg.name}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingOrg(null)}
                                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Form */}
                        <form onSubmit={handleSaveEdit} className="p-5 space-y-4 overflow-y-auto flex-1 scrollbar-thin">
                            {/* Tên tổ chức */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Tên hiển thị tổ chức <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editForm.name}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                />
                            </div>

                            {/* Mã code */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    ID
                                </label>
                                <input
                                    type="text"
                                    value={editForm.code}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, code: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    placeholder="VD: 10266, PRT_VN_01..."
                                />
                            </div>

                            {/* Chọn Quốc gia */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                    Quốc Gia Trực Thuộc <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <select
                                    value={editForm.country}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
                                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                >
                                    {(countriesList.length > 0 ? countriesList : [
                                        { code: 'VN', name: 'Vietnam', flag_emoji: '🇻🇳' },
                                        { code: 'MY', name: 'Malaysia', flag_emoji: '🇲🇾' },
                                        { code: 'ID', name: 'Indonesia', flag_emoji: '🇮🇩' },
                                        { code: 'PH', name: 'Philippines', flag_emoji: '🇵🇭' },
                                    ]).map(c => (
                                        <option key={c.code} value={c.name}>
                                            {c.flag_emoji} {c.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Cấu hình Drive nếu là Distributor */}
                            {editingOrg.role_type === 'distributor' && (
                                <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/70 dark:border-indigo-900/50 space-y-1.5">
                                    <label className="block text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                                        <span>📁 Thư Mục Google Drive Của Distributor (Lưu COF/TOF):</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.drive_folder_url}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, drive_folder_url: e.target.value }))}
                                        placeholder="https://drive.google.com/drive/folders/1BxiMVs..."
                                        className="w-full px-3.5 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                    />
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                        Hệ thống sẽ tự động bóc tách Folder ID để cỗ máy upload file COF/TOF trực tiếp vào đây.
                                    </p>
                                </div>
                            )}

                            {/* Gán lại đơn vị cha (School -> Partner) */}
                            {editingOrg.role_type === 'school' && (
                                <div>
                                    <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1">
                                        Đối tác Quản Lý (Partner)
                                    </label>
                                    <select
                                        value={editForm.parent_id}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, parent_id: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                    >
                                        <option value="">-- Trực tiếp (Không qua Partner) --</option>
                                        {data?.partners.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} ({p.code || 'N/A'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Gán lại đơn vị cha (Partner -> Distributor) */}
                            {editingOrg.role_type === 'partner' && (
                                <div>
                                    <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                                        Nhà Phân Phối Trực Thuộc (Distributor)
                                    </label>
                                    <select
                                        value={editForm.parent_id}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, parent_id: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
                                    >
                                        <option value="">-- Trực tiếp Master --</option>
                                        {data?.distributors.map(d => (
                                            <option key={d.id} value={d.id}>
                                                {d.name} ({d.code || 'N/A'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* KHU VỰC KÉT SẮT FERNET VAULT CÓ SKELETON */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                                        <KeyRound className="w-4 h-4 text-emerald-500" />
                                        <span>Thông tin Đăng Nhập & Két Sắt</span>
                                    </div>
                                    {isLoadingPassword && (
                                        <span className="text-[10px] text-indigo-500 animate-pulse font-mono flex items-center gap-1">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            Đang giải mã két sắt...
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                                        Tên đăng nhập / Email
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.username}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                        placeholder="VD: school_admin..."
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-[11px] font-semibold text-slate-500">
                                            Mật khẩu
                                        </label>
                                    </div>

                                    {/* 🌟 SKELETON SHIMMER KHI ĐANG GIẢI MÃ MẬT KHẨU */}
                                    {isLoadingPassword ? (
                                        <div className="h-9 w-full bg-slate-200 dark:bg-slate-800/80 rounded-lg animate-pulse border border-slate-200 dark:border-slate-700" />
                                    ) : (
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                value={editForm.password}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, password: e.target.value }))}
                                                className="w-full pl-3 pr-10 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                                placeholder="••••••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingOrg(null)}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                                >
                                    Hủy
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || isLoadingPassword}
                                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 active:scale-95 cursor-pointer"
                                >
                                    <Check className="w-4 h-4" />
                                    {isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};