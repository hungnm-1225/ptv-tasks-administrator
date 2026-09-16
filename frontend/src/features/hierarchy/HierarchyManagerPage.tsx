import React, { useState, useEffect, useMemo } from 'react';
import {
    Network, Building2, ShieldCheck, ShieldAlert, Search, Filter,
    Edit3, KeyRound, Eye, EyeOff, RefreshCw, Layers, School, Check, X, ArrowRight
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

    // State Modal chỉnh sửa
    const [editingOrg, setEditingOrg] = useState<OrganizationItem | null>(null);
    const [editForm, setEditForm] = useState({
        name: '',
        code: '',
        parent_id: '',
        username: '',
        password: ''
    });
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

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

    useEffect(() => {
        loadHierarchyData();
    }, []);

    // Mở modal chỉnh sửa
    const handleOpenEdit = (org: OrganizationItem) => {
        setEditingOrg(org);
        setEditForm({
            name: org.name,
            code: org.code === 'N/A' ? '' : org.code,
            parent_id: org.parent_id || '',
            username: org.username || '',
            password: '' // Không nạp mật khẩu cũ để đảm bảo bảo mật tuyệt đối
        });
        setShowPassword(false);
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
            // Tải lại dữ liệu làm tươi giao diện
            await loadHierarchyData(false);
        } catch (err: any) {
            toast.error(err.message || 'Lỗi khi cập nhật phả hệ');
        } finally {
            setIsSubmitting(false);
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
        <div className="space-y-6" >
            {/* Header Bento Title */}
            < div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#131B2B] p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm" >
                <div className="space-y-1" >
                    <div className="flex items-center gap-3" >
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50" >
                            <Network className="w-6 h-6" />
                        </div>
                        < div >
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight" >
                                Quản Trị Phả Hệ & Két Sắt Trường Học
                            </h1>
                            < p className="text-sm text-slate-500 dark:text-slate-400" >
                                Hiệu chỉnh phân cấp 3 tầng(Distributor ➔ Partner ➔ School), sửa tên hiển thị và cập nhật mật khẩu Fernet Vault.
                            </p>
                        </div>
                    </div>
                </div>

                < div className="flex items-center gap-3" >
                    <button
                        onClick={() => loadHierarchyData(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-semibold transition-all border border-slate-200 dark:border-slate-700 active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Làm mới
                    </button>
                </div>
            </div>

            {/* Bento Grid KPI Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" >
                <div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm" >
                    <div className="flex items-center justify-between" >
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" > Trường Học(School) </span>
                        < div className="p-2 bg-sky-50 dark:bg-sky-950/50 text-sky-600 rounded-lg" >
                            <School className="w-4 h-4" />
                        </div>
                    </div>
                    < div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white" > {stats.schools} </div>
                </div>

                < div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm" >
                    <div className="flex items-center justify-between" >
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" > Đối Tác(Partner) </span>
                        < div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-lg" >
                            <Layers className="w-4 h-4" />
                        </div>
                    </div>
                    < div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white" > {stats.partners} </div>
                </div>

                < div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm" >
                    <div className="flex items-center justify-between" >
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" > Nhà Phân Phối(Distributor) </span>
                        < div className="p-2 bg-amber-50 dark:bg-amber-950/50 text-amber-600 rounded-lg" >
                            <Building2 className="w-4 h-4" />
                        </div>
                    </div>
                    < div className="mt-3 text-2xl font-bold text-slate-900 dark:text-white" > {stats.distributors} </div>
                </div>

                < div className="bg-white dark:bg-[#131B2B] p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm" >
                    <div className="flex items-center justify-between" >
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider" > Két Sắt Đã Khóa(Vault) </span>
                        < div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 rounded-lg" >
                            <ShieldCheck className="w-4 h-4" />
                        </div>
                    </div>
                    < div className="mt-3 text-2xl font-bold text-emerald-600 dark:text-emerald-400" >
                        {stats.vaultReady} < span className="text-xs text-slate-400 font-normal" > / {data?.total || 0}</span >
                    </div>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white dark:bg-[#131B2B] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm flex flex-col md:flex-row items-center gap-3" >
                {/* Search */}
                < div className="relative flex-1 w-full" >
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
                <div className="flex items-center gap-2 w-full md:w-auto" >
                    <Filter className="w-4 h-4 text-slate-400" />
                    <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    >
                        <option value="all" > Tất cả cấp bậc </option>
                        < option value="school" > Trường học(School) </option>
                        < option value="partner" > Đối tác(Partner) </option>
                        < option value="distributor" > Nhà phân phối(Distributor) </option>
                    </select>
                </div>

                {/* Partner Filter */}
                {
                    data?.partners && (
                        <select
                            value={selectedPartnerFilter}
                            onChange={(e) => setSelectedPartnerFilter(e.target.value)
                            }
                            className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 max-w-[200px]"
                        >
                            <option value="all" > Tất cả đối tác quản lý </option>
                            {
                                data.partners.map(p => (
                                    <option key={p.id} value={p.id} > {p.name} </option>
                                ))
                            }
                        </select>
                    )}
            </div>

            {/* Main Table */}
            <div className="bg-white dark:bg-[#131B2B] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm overflow-hidden" >
                <div className="overflow-x-auto" >
                    <table className="w-full text-left border-collapse" >
                        <thead>
                            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/30" >
                                <th className="py-3.5 px-4" > Tổ Chức / Đơn Vị </th>
                                < th className="py-3.5 px-4" > Cấp Bậc </th>
                                < th className="py-3.5 px-4" > Phả Hệ Cha Con(Lineage) </th>
                                < th className="py-3.5 px-4" > Tài Khoản & Két Sắt </th>
                                < th className="py-3.5 px-4 text-right" > Thao Tác </th>
                            </tr>
                        </thead>
                        < tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm" >
                            {
                                loading ? (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-slate-400" >
                                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                                            Đang giải mã phả hệ 480 trường học...
                                        </td>
                                    </tr>
                                ) : filteredOrgs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="py-12 text-center text-slate-400" >
                                            Không tìm thấy đơn vị nào khớp với tiêu chí lọc.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredOrgs.map((org) => {
                                        const isSchool = org.role_type === 'school';
                                        const isPartner = org.role_type === 'partner';

                                        return (
                                            <tr key={org.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors" >
                                                {/* Name & Code */}
                                                < td className="py-3.5 px-4" >
                                                    <div className="font-semibold text-slate-900 dark:text-white" >
                                                        {org.name}
                                                    </div>
                                                    < div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5" >
                                                        <span>Mã: {org.code} </span>
                                                        <span>•</span>
                                                        < span > {org.country} </span>
                                                    </div>
                                                </td>

                                                {/* Role Badge */}
                                                <td className="py-3.5 px-4" >
                                                    {isSchool && (
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/50" >
                                                            School
                                                        </span>
                                                    )}
                                                    {
                                                        isPartner && (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50" >
                                                                Partner
                                                            </span>
                                                        )
                                                    }
                                                    {
                                                        org.role_type === 'distributor' && (
                                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/50" >
                                                                Distributor
                                                            </span>
                                                        )
                                                    }
                                                </td>

                                                {/* Parent Lineage */}
                                                <td className="py-3.5 px-4" >
                                                    {isSchool && (
                                                        <div className="flex items-center gap-1.5 text-xs" >
                                                            <span className="text-amber-600 dark:text-amber-400 font-medium" >
                                                                {org.distributor_name}
                                                            </span>
                                                            < ArrowRight className="w-3 h-3 text-slate-400" />
                                                            <span className="text-indigo-600 dark:text-indigo-400 font-medium" >
                                                                {org.parent_name}
                                                            </span>
                                                        </div>
                                                    )}
                                                    {
                                                        isPartner && (
                                                            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium" >
                                                                <Building2 className="w-3.5 h-3.5" />
                                                                <span>Trực thuộc: {org.parent_name} </span>
                                                            </div>
                                                        )
                                                    }
                                                    {
                                                        org.role_type === 'distributor' && (
                                                            <span className="text-xs text-slate-400 italic" > Đơn vị Master cấp cao nhất </span>
                                                        )
                                                    }
                                                </td>

                                                {/* Username & Vault Status */}
                                                <td className="py-3.5 px-4" >
                                                    <div className="flex items-center gap-2" >
                                                        <span className="font-mono text-xs text-slate-600 dark:text-slate-300" >
                                                            {org.username || <span className="text-slate-400 italic"> Chưa cấu hình</ span >}
                                                        </span>
                                                        {
                                                            org.has_vault_pass ? (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200/50 dark:border-emerald-900/50" title="Mật khẩu đã được mã hóa an toàn bằng Fernet" >
                                                                    <ShieldCheck className="w-3 h-3" />
                                                                    Vault
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md border border-rose-200/50 dark:border-rose-900/50" title="Chưa cấu hình mật khẩu trong két sắt" >
                                                                    <ShieldAlert className="w-3 h-3" />
                                                                    Trống pass
                                                                </span>
                                                            )
                                                        }
                                                    </div>
                                                </td>

                                                {/* Edit Action Button */}
                                                <td className="py-3.5 px-4 text-right" >
                                                    <button
                                                        onClick={() => handleOpenEdit(org)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-semibold transition-all border border-indigo-200/60 dark:border-indigo-800/60 active:scale-95"
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
            </div>

            {/* Modal Chỉnh Sửa Phả Hệ & Mật Khẩu Fernet */}
            {
                editingOrg && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" >
                        <div className="bg-white dark:bg-[#131B2B] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" >
                            {/* Modal Header */}
                            < div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50" >
                                <div className="flex items-center gap-2.5" >
                                    <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-xl" >
                                        <Edit3 className="w-5 h-5" />
                                    </div>
                                    < div >
                                        <h3 className="font-bold text-slate-900 dark:text-white" >
                                            Hiệu Chỉnh Phả Hệ & Két Sắt
                                        </h3>
                                        < p className="text-xs text-slate-400" >
                                            Mã UUID: {editingOrg.id}
                                        </p>
                                    </div>
                                </div>
                                < button
                                    onClick={() => setEditingOrg(null)
                                    }
                                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Form */}
                            <form onSubmit={handleSaveEdit} className="p-5 space-y-4" >
                                {/* Tên tổ chức */}
                                < div >
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" >
                                        Tên hiển thị tổ chức(*)
                                    </label>
                                    < input
                                        type="text"
                                        required
                                        value={editForm.name}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                </div>

                                {/* Mã code */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1" >
                                        Mã School / Org Code
                                    </label>
                                    < input
                                        type="text"
                                        value={editForm.code}
                                        onChange={(e) => setEditForm(prev => ({ ...prev, code: e.target.value }))}
                                        className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        placeholder="VD: 10266, PRT_VN_01..."
                                    />
                                </div>

                                {/* GÁN LẠI ĐƠN VỊ QUẢN LÝ CHA (RE-ASSIGN PARENT) */}
                                {
                                    editingOrg.role_type === 'school' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-1 flex items-center justify-between" >
                                                <span>Đơn Vị Quản Lý Cha(Partner) </span>
                                                < span className="text-[11px] font-normal text-slate-400" > Chọn đúng đối tác quản trị </span>
                                            </label>
                                            < select
                                                value={editForm.parent_id}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, parent_id: e.target.value }))
                                                }
                                                className="w-full px-3.5 py-2 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            >
                                                <option value="" > --Trực tiếp(Không qua Partner)-- </option>
                                                {
                                                    data?.partners.map(p => (
                                                        <option key={p.id} value={p.id} >
                                                            {p.name}({p.code || 'N/A'})
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                    )}

                                {
                                    editingOrg.role_type === 'partner' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1" >
                                                Nhà Phân Phối Trực Thuộc(Distributor)
                                            </label>
                                            < select
                                                value={editForm.parent_id}
                                                onChange={(e) => setEditForm(prev => ({ ...prev, parent_id: e.target.value }))
                                                }
                                                className="w-full px-3.5 py-2 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                                            >
                                                <option value="" > --Trực tiếp Master-- </option>
                                                {
                                                    data?.distributors.map(d => (
                                                        <option key={d.id} value={d.id} >
                                                            {d.name}({d.code || 'N/A'})
                                                        </option>
                                                    ))
                                                }
                                            </select>
                                        </div>
                                    )}

                                {/* KHU VỰC KÉT SẮT FERNET VAULT */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3" >
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white" >
                                        <KeyRound className="w-4 h-4 text-emerald-500" />
                                        Két Sắt Tài Khoản Đăng Nhập(Fernet Vault)
                                    </div>

                                    < div >
                                        <label className="block text-[11px] font-semibold text-slate-500 mb-1" >
                                            Tên đăng nhập(Username Workspace)
                                        </label>
                                        < input
                                            type="text"
                                            value={editForm.username}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                                            placeholder="VD: school_admin..."
                                        />
                                    </div>

                                    < div >
                                        <label className="block text-[11px] font-semibold text-slate-500 mb-1" >
                                            Mật khẩu mới(Để trống nếu giữ nguyên mật khẩu cũ)
                                        </label>
                                        < div className="relative" >
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
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        < p className="text-[10px] text-slate-400 mt-1" >
                                            Mật khẩu sẽ được mã hóa đối xứng 32 - byte Fernet trước khi lưu vào Supabase.
                                        </p>
                                    </div>
                                </div>

                                {/* Modal Actions */}
                                <div className="flex items-center justify-end gap-3 pt-2" >
                                    <button
                                        type="button"
                                        onClick={() => setEditingOrg(null)}
                                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    < button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 active:scale-95"
                                    >
                                        <Check className="w-4 h-4" />
                                        {isSubmitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
        </div>
    );
};