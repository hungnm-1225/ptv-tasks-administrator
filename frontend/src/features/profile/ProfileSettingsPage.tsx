import React, { useState, useEffect, useRef } from 'react';
import {
    Save, User, Link as LinkIcon, MapPin, Building, Github, Linkedin,
    Facebook, Mail, Globe, Loader2, Plus, Trash2, Upload,
    ExternalLink, Layers, Send, Instagram, MessageCircle, Twitter,
    Youtube, MessageSquare, AtSign, Camera
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authorConfig, SocialLink } from '../../config/authorConfig';
import { toast } from 'sonner';

const PROFILE_RECORD_ID = '00000000-0000-0000-0000-000000000001';

// Tự động nhận diện MXH
const detectPlatform = (url: string, name: string): { iconName: string; colorClass: string; defaultName: string } => {
    const lowerUrl = url.toLowerCase();
    const lowerName = name.toLowerCase();

    if (lowerUrl.includes('threads.net') || lowerName.includes('threads')) {
        return { iconName: 'threads', colorClass: 'hover:text-slate-100 hover:border-slate-400', defaultName: 'Threads' };
    }
    if (lowerUrl.includes('zalo.me') || lowerName.includes('zalo')) {
        return { iconName: 'zalo', colorClass: 'hover:text-blue-500 hover:border-blue-500/50', defaultName: 'Zalo' };
    }
    if (lowerUrl.includes('whatsapp') || lowerUrl.includes('wa.me') || lowerName.includes('whatsapp')) {
        return { iconName: 'whatsapp', colorClass: 'hover:text-emerald-400 hover:border-emerald-500/50', defaultName: 'WhatsApp' };
    }
    if (lowerUrl.includes('instagram.com') || lowerName.includes('instagram')) {
        return { iconName: 'instagram', colorClass: 'hover:text-pink-500 hover:border-pink-500/50', defaultName: 'Instagram' };
    }
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com') || lowerName.includes('twitter') || lowerName === 'x') {
        return { iconName: 'twitter', colorClass: 'hover:text-slate-100 hover:border-slate-500', defaultName: 'X (Twitter)' };
    }
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be') || lowerName.includes('youtube')) {
        return { iconName: 'youtube', colorClass: 'hover:text-rose-500 hover:border-rose-500/50', defaultName: 'YouTube' };
    }
    if (lowerUrl.includes('discord') || lowerName.includes('discord')) {
        return { iconName: 'discord', colorClass: 'hover:text-accent-2 hover:border-accent', defaultName: 'Discord' };
    }
    if (lowerUrl.includes('github.com') || lowerName.includes('github')) {
        return { iconName: 'github', colorClass: 'hover:text-slate-100 hover:border-slate-500', defaultName: 'GitHub' };
    }
    if (lowerUrl.includes('linkedin.com') || lowerName.includes('linkedin')) {
        return { iconName: 'linkedin', colorClass: 'hover:text-blue-400 hover:border-blue-500/40', defaultName: 'LinkedIn' };
    }
    if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com') || lowerName.includes('facebook')) {
        return { iconName: 'facebook', colorClass: 'hover:text-blue-500 hover:border-blue-600/40', defaultName: 'Facebook' };
    }
    if (lowerUrl.startsWith('mailto:') || lowerName.includes('email') || lowerUrl.includes('@')) {
        return { iconName: 'mail', colorClass: 'hover:text-rose-400 hover:border-rose-500/40', defaultName: 'Email' };
    }
    return { iconName: 'globe', colorClass: 'hover:text-cyan-400 hover:border-cyan-500/40', defaultName: 'Website' };
};

export const ProfileSettingsPage: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'project'>('profile');

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [name, setName] = useState(authorConfig.name);
    const [title, setTitle] = useState(authorConfig.title);
    const [bio, setBio] = useState(authorConfig.bio);
    const [avatarUrl, setAvatarUrl] = useState(authorConfig.avatarUrl);
    const [location, setLocation] = useState(authorConfig.location);
    const [organization, setOrganization] = useState(authorConfig.organization);
    const [socials, setSocials] = useState<SocialLink[]>(authorConfig.socials);
    const [projectInfo, setProjectInfo] = useState(authorConfig.projectInfo);

    // 1. Tải dữ liệu chính xác nhất từ Supabase
    useEffect(() => {
        async function loadProfile() {
            try {
                const { data, error } = await supabase
                    .from('author_profile')
                    .select('*')
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data && !error) {
                    setName(data.name || authorConfig.name);
                    setTitle(data.title || authorConfig.title);
                    setBio(data.bio || authorConfig.bio);
                    setAvatarUrl(data.avatar_url || authorConfig.avatarUrl);
                    setLocation(data.location || authorConfig.location);
                    setOrganization(data.organization || authorConfig.organization);
                    if (data.socials && Array.isArray(data.socials)) setSocials(data.socials);
                    if (data.project_info) setProjectInfo(data.project_info);
                }
            } catch (err) {
                console.error("Lỗi nạp profile:", err);
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, []);

    // 2. Upload Avatar thuần Supabase Storage
    const handleAvatarFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error("Vui lòng chọn tệp định dạng hình ảnh!");
            return;
        }

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('ticket-attachments')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('ticket-attachments')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrlData.publicUrl);
            toast.success("Đã tải ảnh đại diện lên Supabase Storage thành công!");
        } catch (err: any) {
            toast.error("Lỗi tải ảnh: " + (err.message || "Kiểm tra lại quyền Storage"));
        } finally {
            setUploadingAvatar(false);
        }
    };

    // 3. Quản lý MXH
    const handleAddSocial = () => {
        setSocials([...socials, {
            name: "Liên kết mới",
            url: "",
            iconName: "globe",
            colorClass: "hover:text-cyan-400 hover:border-cyan-500/40"
        }]);
    };

    const handleRemoveSocial = (index: number) => {
        setSocials(socials.filter((_, i) => i !== index));
    };

    const handleUpdateSocialUrl = (index: number, newUrl: string) => {
        const updated = [...socials];
        const currentName = updated[index].name;
        const detected = detectPlatform(newUrl, currentName);

        updated[index].url = newUrl;
        updated[index].iconName = detected.iconName as any;
        updated[index].colorClass = detected.colorClass;
        if (currentName === "Liên kết mới" || !currentName) {
            updated[index].name = detected.defaultName;
        }
        setSocials(updated);
    };

    const handleUpdateSocialName = (index: number, newName: string) => {
        const updated = [...socials];
        const detected = detectPlatform(updated[index].url, newName);
        updated[index].name = newName;
        updated[index].iconName = detected.iconName as any;
        updated[index].colorClass = detected.colorClass;
        setSocials(updated);
    };

    // 4. Lưu dữ liệu với ID duy nhất
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const payload = {
                id: PROFILE_RECORD_ID,
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
                .upsert(payload, { onConflict: 'id' });

            if (error) throw error;

            toast.success("Đã lưu thành công! Thông tin mới đã được cập nhật ngay lập tức.");
        } catch (error: any) {
            toast.error("Lỗi lưu dữ liệu: " + (error.message || "Không thể kết nối Supabase"));
        } finally {
            setSaving(false);
        }
    };

    const getSocialIcon = (iconName: string) => {
        switch (iconName) {
            case 'github': return <Github className="w-4 h-4 text-ink dark:text-primary-ink" />;
            case 'linkedin': return <Linkedin className="w-4 h-4 text-blue-600" />;
            case 'facebook': return <Facebook className="w-4 h-4 text-blue-500" />;
            case 'mail': return <Mail className="w-4 h-4 text-rose-500" />;
            case 'instagram': return <Instagram className="w-4 h-4 text-pink-500" />;
            case 'threads': return <AtSign className="w-4 h-4 text-ink dark:text-primary-ink" />;
            case 'whatsapp':
            case 'zalo': return <MessageCircle className="w-4 h-4 text-emerald-500" />;
            case 'twitter': return <Twitter className="w-4 h-4 text-sky-400" />;
            case 'youtube': return <Youtube className="w-4 h-4 text-rose-600" />;
            case 'discord': return <MessageSquare className="w-4 h-4 text-accent" />;
            default: return <Globe className="w-4 h-4 text-cyan-500" />;
        }
    };

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
                <p className="text-xs text-slate-500">Đang đồng bộ hồ sơ...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-400">

            {/* Header Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/70 dark:bg-ink/70 p-6 rounded-3xl border border-rule/80 dark:border-rule-2/80 backdrop-blur-md shadow-xs">
                <div>
                    <div className="flex items-center gap-2.5 mb-1">
                        <h1 className="text-xl font-bold text-ink dark:text-primary-ink">Thiết Lập Chủ Quyền Tác Giả</h1>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-soft text-accent dark:bg-accent-soft dark:text-accent-2 border border-accent-soft dark:border-accent">
                            Admin Exclusive
                        </span>
                    </div>
                    <p className="text-xs text-ink-2 dark:text-ink-3">
                        Cập nhật họ tên, avatar lưu trên Supabase Storage và hệ sinh thái MXH hiển thị ở Trang Chủ.
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-accent text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Lưu Thay Đổi Ngay
                </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 border-b border-rule dark:border-rule-2 pb-2">
                <button
                    onClick={() => setActiveTab('profile')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === 'profile'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-ink-2 hover:text-ink dark:hover:text-primary-ink hover:bg-paper-2 dark:hover:bg-ink'
                        }`}
                >
                    <User className="w-3.5 h-3.5" />
                    Hồ Sơ & Mạng Xã Hội
                </button>

                <button
                    onClick={() => setActiveTab('project')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${activeTab === 'project'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-ink-2 hover:text-ink dark:hover:text-primary-ink hover:bg-paper-2 dark:hover:bg-ink'
                        }`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Thông Tin Dự Án & Tech Stack
                </button>
            </div>

            {/* TAB 1: THÔNG TIN HỒ SƠ TÁC GIẢ */}
            {activeTab === 'profile' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Cột 1: Live Card Preview + Avatar Upload */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-ink p-6 rounded-3xl border border-rule/80 dark:border-rule-2/80 shadow-xs flex flex-col items-center text-center">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-4">Ảnh Đại Diện Trang Chủ</p>

                            <div className="relative group mb-5">
                                <img
                                    src={avatarUrl || authorConfig.avatarUrl}
                                    alt={name}
                                    onError={(e) => { (e.target as any).src = authorConfig.avatarUrl; }}
                                    className="w-32 h-32 rounded-full border-4 border-accent object-cover shadow-lg group-hover:opacity-90 transition duration-300"
                                />
                                {uploadingAvatar && (
                                    <div className="absolute inset-0 bg-ink/70 rounded-full flex flex-col items-center justify-center gap-1">
                                        <Loader2 className="w-6 h-6 text-accent-2 animate-spin" />
                                        <span className="text-[9px] text-white font-medium">Đang tải...</span>
                                    </div>
                                )}

                                {/* Nút camera overlay */}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingAvatar}
                                    title="Thay đổi ảnh"
                                    className="absolute bottom-0 right-0 p-2 bg-accent hover:bg-accent-2 text-white rounded-full shadow-md transition cursor-pointer"
                                >
                                    <Camera className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Input file ẩn */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarFileUpload}
                                accept="image/*"
                                className="hidden"
                            />

                            <h3 className="text-base font-bold text-ink dark:text-primary-ink">{name || 'Chưa đặt tên'}</h3>
                            <p className="text-xs text-accent dark:text-accent-2 font-medium mb-3">{title || 'Chức danh'}</p>

                            <div className="flex items-center gap-2 text-[11px] text-ink-2 dark:text-ink-3">
                                <Building className="w-3.5 h-3.5 shrink-0" />
                                <span>{organization}</span>
                                <span>•</span>
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>{location}</span>
                            </div>
                        </div>
                    </div>

                    {/* Cột 2 & 3: Thông tin chi tiết */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-ink p-6 rounded-3xl border border-rule/80 dark:border-rule-2/80 shadow-xs space-y-5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Thông Tin Cơ Bản</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Họ và Tên (*)</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Chức Danh / Vị Trí (*)</label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Tổ Chức / Đơn Vị</label>
                                    <input
                                        type="text"
                                        value={organization}
                                        onChange={e => setOrganization(e.target.value)}
                                        className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Địa Điểm</label>
                                    <input
                                        type="text"
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                        className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Giới Thiệu Tác Giả</label>
                                <textarea
                                    rows={3}
                                    value={bio}
                                    onChange={e => setBio(e.target.value)}
                                    className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl p-3.5 text-xs text-primary dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none leading-relaxed"
                                />
                            </div>

                            {/* Danh sách Mạng Xã Hội */}
                            <div className="pt-4 border-t border-rule dark:border-rule-2 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Hệ Sinh Thái Mạng Xã Hội</h3>
                                        <p className="text-[11px] text-ink-2">Tự động nhận diện Threads, Zalo, WhatsApp, Instagram, X, YouTube, Discord...</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddSocial}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-soft text-accent dark:bg-accent-soft dark:text-accent-2 border border-accent-soft dark:border-accent rounded-xl text-xs font-semibold hover:bg-accent-soft transition cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Thêm Liên Kết</span>
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {socials.map((social, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-paper-2 dark:bg-ink/50 p-2.5 rounded-2xl border border-rule/70 dark:border-rule-2/50 transition-all focus-within:border-accent">
                                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-ink border border-rule dark:border-rule-2 shadow-xs flex items-center justify-center shrink-0">
                                                {getSocialIcon(social.iconName)}
                                            </div>

                                            <div className="w-32 shrink-0">
                                                <input
                                                    type="text"
                                                    value={social.name}
                                                    onChange={(e) => handleUpdateSocialName(idx, e.target.value)}
                                                    placeholder="Tên MXH"
                                                    className="w-full bg-white dark:bg-ink border border-rule dark:border-rule-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink dark:text-primary-ink outline-none"
                                                />
                                            </div>

                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={social.url}
                                                    onChange={(e) => handleUpdateSocialUrl(idx, e.target.value)}
                                                    placeholder="Dán link trang cá nhân (VD: https://t.me/..., https://threads.net/@...)"
                                                    className="w-full bg-white dark:bg-ink border border-rule dark:border-rule-2 rounded-lg px-3 py-1.5 text-xs text-ink-2 dark:text-primary-ink focus:ring-2 focus:ring-accent focus:border-accent outline-none"
                                                />

                                                {social.url && (
                                                    <a
                                                        href={social.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="Mở thử liên kết"
                                                        className="p-1.5 text-ink-3 hover:text-accent transition shrink-0"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSocial(idx)}
                                                    title="Xóa liên kết này"
                                                    className="p-1.5 text-ink-3 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition shrink-0 cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            )}

            {/* TAB 2: PROJECT INFO */}
            {activeTab === 'project' && (
                <div className="bg-white dark:bg-ink p-6 rounded-3xl border border-rule/80 dark:border-rule-2/80 shadow-xs space-y-6">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">Thông Tin Dự Án</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Tên Dự Án</label>
                            <input
                                type="text"
                                value={projectInfo.name}
                                onChange={e => setProjectInfo({ ...projectInfo, name: e.target.value })}
                                className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Phiên Bản</label>
                            <input
                                type="text"
                                value={projectInfo.version}
                                onChange={e => setProjectInfo({ ...projectInfo, version: e.target.value })}
                                className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Mô Tả Tổng Quan Dự Án</label>
                        <textarea
                            rows={3}
                            value={projectInfo.description}
                            onChange={e => setProjectInfo({ ...projectInfo, description: e.target.value })}
                            className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl p-3.5 text-xs text-primary dark:text-primary-ink outline-none focus:ring-2 focus:ring-accent"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-ink-2 dark:text-primary-ink">Điểm Nhấn Công Nghệ (Tech Stack - Phân cách bằng dấu phẩy)</label>
                        <input
                            type="text"
                            value={Array.isArray(projectInfo.techStack) ? projectInfo.techStack.join(', ') : ''}
                            onChange={e => setProjectInfo({ ...projectInfo, techStack: e.target.value.split(',').map(s => s.trim()) })}
                            className="w-full bg-paper-2 dark:bg-ink/80 border border-rule dark:border-rule-2/60 rounded-xl px-3.5 py-2 text-xs text-primary dark:text-primary-ink outline-none focus:ring-2 focus:ring-accent"
                        />
                    </div>
                </div>
            )}

        </div>
    );
};