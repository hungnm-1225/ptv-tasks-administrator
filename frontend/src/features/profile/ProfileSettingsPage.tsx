import React, { useState, useEffect } from 'react';
import {
    Save, User, Link as LinkIcon, MapPin, Building, Github, Linkedin,
    Facebook, Mail, Globe, Loader2, Sparkles, RefreshCw, CheckCircle2,
    ExternalLink, Layers, Code2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authorConfig, AuthorConfig, SocialLink } from '../../config/authorConfig';
import { toast } from 'sonner';

export const ProfileSettingsPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'project'>('profile');

    // Form State
    const [name, setName] = useState(authorConfig.name);
    const [title, setTitle] = useState(authorConfig.title);
    const [bio, setBio] = useState(authorConfig.bio);
    const [avatarUrl, setAvatarUrl] = useState(authorConfig.avatarUrl);
    const [location, setLocation] = useState(authorConfig.location);
    const [organization, setOrganization] = useState(authorConfig.organization);
    const [socials, setSocials] = useState<SocialLink[]>(authorConfig.socials);
    const [projectInfo, setProjectInfo] = useState(authorConfig.projectInfo);

    // 1. Tải dữ liệu từ Supabase khi mở trang (Fallback vào authorConfig nếu chưa có)
    useEffect(() => {
        async function loadProfile() {
            try {
                const { data, error } = await supabase
                    .from('author_profile')
                    .select('*')
                    .limit(1)
                    .maybeSingle();

                if (data && !error) {
                    setName(data.name || authorConfig.name);
                    setTitle(data.title || authorConfig.title);
                    setBio(data.bio || authorConfig.bio);
                    setAvatarUrl(data.avatar_url || authorConfig.avatarUrl);
                    setLocation(data.location || authorConfig.location);
                    setOrganization(data.organization || authorConfig.organization);
                    if (data.socials) setSocials(data.socials);
                    if (data.project_info) setProjectInfo(data.project_info);
                }
            } catch (err) {
                console.error("Lỗi tải thông tin:", err);
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, []);

    // 2. Cập nhật từng link mạng xã hội
    const handleUpdateSocial = (index: number, newUrl: string) => {
        const updated = [...socials];
        updated[index].url = newUrl;
        setSocials(updated);
    };

    // 3. Hàm lưu toàn bộ thông tin lên Supabase
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                id: '00000000-0000-0000-0000-000000000001',
                name,
                title,
                bio,
                avatar_url: avatarUrl,
                location,
                organization,
                socials,
                project_info: projectInfo,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('author_profile')
                .upsert(payload);

            if (error) throw error;

            toast.success("Đã cập nhật thông tin chủ quyền tác giả thành công! Trang chủ đã được đồng bộ.");
        } catch (error: any) {
            toast.error("Lỗi khi lưu: " + (error.message || "Không thể kết nối Supabase"));
        } finally {
            setSaving(false);
        }
    };

    // Helper lấy icon tương ứng
    const getSocialIcon = (iconName: string) => {
        switch (iconName) {
            case 'github': return <Github className="w-4 h-4 text-slate-700 dark:text-slate-300" />;
            case 'linkedin': return <Linkedin className="w-4 h-4 text-blue-600" />;
            case 'facebook': return <Facebook className="w-4 h-4 text-blue-500" />;
            case 'mail': return <Mail className="w-4 h-4 text-rose-500" />;
            default: return <Globe className="w-4 h-4 text-cyan-500" />;
        }
    };

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                <p className="text-xs text-slate-500">Đang đồng bộ hồ sơ tác giả...</p>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">

            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/70 dark:bg-slate-900/70 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-md shadow-xs">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Thiết Lập Chủ Quyền Tác Giả</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30">
                            Admin Exclusive
                        </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tất cả thông tin chỉnh sửa tại đây sẽ tự động hiển thị trực tiếp lên Trang Chủ (Landing Page).
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md shadow-violet-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Lưu Thay Đổi Ngay
                    </button>
                </div>
            </div>

            {/* Tabs Chuyển Đổi */}
            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === 'profile'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                >
                    <User className="w-3.5 h-3.5" />
                    Hồ Sơ & Mạng Xã Hội
                </button>

                <button
                    onClick={() => setActiveTab('project')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === 'project'
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Thông Tin Dự Án & Tech Stack
                </button>
            </div>

            {/* TAB 1: THÔNG TIN HỒ SƠ TÁC GIẢ */}
            {activeTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Cột 1: Live Card Preview + Avatar URL */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col items-center text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">Xem Trước Thẻ Trang Chủ</p>

                            <div className="relative group mb-4">
                                <img
                                    src={avatarUrl || 'https://via.placeholder.com/150'}
                                    alt={name}
                                    onError={(e) => { (e.target as any).src = 'https://via.placeholder.com/150?text=Avatar'; }}
                                    className="w-28 h-28 rounded-full border-4 border-violet-500/20 object-cover shadow-lg group-hover:scale-105 transition-transform duration-300"
                                />
                            </div>

                            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{name || 'Chưa đặt tên'}</h3>
                            <p className="text-xs text-violet-600 dark:text-violet-400 font-medium mb-3">{title || 'Chức danh'}</p>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                                <Building className="w-3.5 h-3.5 shrink-0" />
                                <span>{organization}</span>
                                <span>•</span>
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>{location}</span>
                            </div>

                            <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800 text-left space-y-3">
                                <label className="block text-[10px] font-bold uppercase text-slate-400">Đường dẫn ảnh đại diện (Avatar URL)</label>
                                <input
                                    type="text"
                                    value={avatarUrl}
                                    onChange={(e) => setAvatarUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Cột 2 & 3: Chi tiết thông tin & Danh sách mạng xã hội */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Thông Tin Cơ Bản</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Họ và Tên (*)</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Chức Danh / Vị Trí (*)</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Tổ Chức / Đơn Vị</label>
                                    <input
                                        type="text"
                                        value={organization}
                                        onChange={e => setOrganization(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Địa Điểm (Location)</label>
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Giới Thiệu Ngắn (Bio Tác Giả)</label>
                                <textarea
                                    rows={3}
                                    value={bio}
                                    onChange={e => setBio(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none leading-relaxed"
                                />
                            </div>

                            {/* Danh sách 5 Mạng Xã Hội */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Đường Dẫn Liên Kết Mạng Xã Hội (Click-to-Redirect)</h3>

                                <div className="grid grid-cols-1 gap-3">
                                    {socials.map((social, idx) => (
                                        <div key={social.name} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/50">
                                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center shrink-0">
                                                {getSocialIcon(social.iconName)}
                                            </div>

                                            <div className="w-32 shrink-0">
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{social.name}</p>
                                            </div>

                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={social.url}
                                                    onChange={(e) => handleUpdateSocial(idx, e.target.value)}
                                                    placeholder={`Link ${social.name}...`}
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                                />
                                                {social.url && (
                                                    <a
                                                        href={social.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="Mở thử link"
                                                        className="p-2 text-slate-400 hover:text-violet-600 transition"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            )}

            {/* TAB 2: THÔNG TIN DỰ ÁN & TECH STACK */}
            {activeTab === 'project' && (
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Thông Tin Dự Án (Project Info)</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Tên Dự Án</label>
                            <input
                                type="text"
                                value={projectInfo.name}
                                onChange={e => setProjectInfo({ ...projectInfo, name: e.target.value })}
                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Phiên Bản (Version)</label>
                            <input
                                type="text"
                                value={projectInfo.version}
                                onChange={e => setProjectInfo({ ...projectInfo, version: e.target.value })}
                                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Mô Tả Tổng Quan Dự Án</label>
                        <textarea
                            rows={3}
                            value={projectInfo.description}
                            onChange={e => setProjectInfo({ ...projectInfo, description: e.target.value })}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Điểm Nhấn Công Nghệ (Tech Stack - Phân cách bằng dấu phẩy)</label>
                        <input
                            type="text"
                            value={projectInfo.techStack.join(', ')}
                            onChange={e => setProjectInfo({ ...projectInfo, techStack: e.target.value.split(',').map(s => s.trim()) })}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                    </div>
                </div>
            )}

        </div>
    );
};