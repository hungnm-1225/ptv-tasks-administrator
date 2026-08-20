import React, { useState, useEffect, useRef } from 'react';
import {
    Save, User, Link as LinkIcon, MapPin, Building, Github, Linkedin,
    Facebook, Mail, Globe, Loader2, Sparkles, Plus, Trash2, Upload,
    ExternalLink, Layers, Send, Instagram, MessageCircle, Twitter,
    Youtube, MessageSquare, Share2, AtSign
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { authorConfig, AuthorConfig, SocialLink } from '../../config/authorConfig';
import { toast } from 'sonner';

// Thuật toán tự động nhận diện nền tảng từ URL hoặc tên
const detectPlatform = (url: string, name: string): { iconName: string; colorClass: string; defaultName: string } => {
    const lowerUrl = url.toLowerCase();
    const lowerName = name.toLowerCase();

    if (lowerUrl.includes('threads.net') || lowerName.includes('threads')) {
        return { iconName: 'threads', colorClass: 'hover:text-slate-100 hover:border-slate-400', defaultName: 'Threads' };
    }
    if (lowerUrl.includes('t.me') || lowerUrl.includes('telegram') || lowerName.includes('telegram')) {
        return { iconName: 'telegram', colorClass: 'hover:text-sky-400 hover:border-sky-500/50', defaultName: 'Telegram' };
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
        return { iconName: 'discord', colorClass: 'hover:text-indigo-400 hover:border-indigo-500/50', defaultName: 'Discord' };
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

    // 1. Tải dữ liệu ban đầu
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

    // 2. Xử lý Upload Avatar lên Supabase Storage Bucket
    const handleAvatarFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error("Vui lòng chọn file định dạng hình ảnh (PNG, JPG, WEBP)!");
            return;
        }

        setUploadingAvatar(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `author_avatar_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            // Upload lên bucket ticket-attachments
            const { error: uploadError } = await supabase.storage
                .from('ticket-attachments')
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // Lấy URL công khai
            const { data: publicUrlData } = supabase.storage
                .from('ticket-attachments')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrlData.publicUrl);
            toast.success("Tải ảnh đại diện lên Supabase Storage thành công!");
        } catch (err: any) {
            toast.error("Không thể tải ảnh: " + (err.message || "Lỗi bucket storage"));
        } finally {
            setUploadingAvatar(false);
        }
    };

    // 3. Quản lý danh sách Mạng Xã Hội
    const handleAddSocial = () => {
        const newSocial: SocialLink = {
            name: "Liên kết mới",
            url: "",
            iconName: "globe",
            colorClass: "hover:text-cyan-400 hover:border-cyan-500/40"
        };
        setSocials([...socials, newSocial]);
    };

    const handleRemoveSocial = (index: number) => {
        const updated = socials.filter((_, i) => i !== index);
        setSocials(updated);
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

    // 4. Lưu dữ liệu lên Supabase
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

            toast.success("Đã lưu thành công! Thông tin và ảnh mới đã được đồng bộ lên Trang Chủ.");
        } catch (error: any) {
            toast.error("Lỗi khi lưu: " + (error.message || "Vui lòng kiểm tra lại Supabase"));
        } finally {
            setSaving(false);
        }
    };

    // Render Icon động
    const getSocialIcon = (iconName: string) => {
        switch (iconName) {
            case 'github': return <Github className="w-4 h-4 text-slate-800 dark:text-slate-200" />;
            case 'linkedin': return <Linkedin className="w-4 h-4 text-blue-600" />;
            case 'facebook': return <Facebook className="w-4 h-4 text-blue-500" />;
            case 'mail': return <Mail className="w-4 h-4 text-rose-500" />;
            case 'telegram': return <Send className="w-4 h-4 text-sky-500" />;
            case 'instagram': return <Instagram className="w-4 h-4 text-pink-500" />;
            case 'threads': return <AtSign className="w-4 h-4 text-slate-800 dark:text-slate-200" />;
            case 'whatsapp':
            case 'zalo': return <MessageCircle className="w-4 h-4 text-emerald-500" />;
            case 'twitter': return <Twitter className="w-4 h-4 text-sky-400" />;
            case 'youtube': return <Youtube className="w-4 h-4 text-rose-600" />;
            case 'discord': return <MessageSquare className="w-4 h-4 text-indigo-500" />;
            default: return <Globe className="w-4 h-4 text-cyan-500" />;
        }
    };

    if (loading) {
        return (
            <div className="flex h-[70vh] flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                <p className="text-xs text-slate-500">Đang đồng bộ dữ liệu hồ sơ...</p>
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
                        Cập nhật họ tên, ảnh đại diện và hệ sinh thái mạng xã hội hiển thị tại Trang Chủ.
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold text-xs transition-all shadow-md shadow-violet-500/25 active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Lưu Thay Đổi Ngay
                </button>
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

                    {/* Cột 1: Live Card Preview + Avatar Upload */}
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
                                {uploadingAvatar && (
                                    <div className="absolute inset-0 bg-slate-900/60 rounded-full flex items-center justify-center">
                                        <Loader2 className="w-6 h-6 text-white animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Nút Upload Ảnh lên Supabase Storage */}
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleAvatarFileUpload}
                                accept="image/*"
                                className="hidden"
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingAvatar}
                                className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-50 dark:bg-violet-500/15 hover:bg-violet-100 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 rounded-xl text-xs font-semibold transition cursor-pointer mb-4"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                <span>{uploadingAvatar ? "Đang tải lên..." : "Tải ảnh từ máy tính"}</span>
                            </button>

                            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{name || 'Chưa đặt tên'}</h3>
                            <p className="text-xs text-violet-600 dark:text-violet-400 font-medium mb-3">{title || 'Chức danh'}</p>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                                <Building className="w-3.5 h-3.5 shrink-0" />
                                <span>{organization}</span>
                                <span>•</span>
                                <MapPin className="w-3.5 h-3.5 shrink-0" />
                                <span>{location}</span>
                            </div>

                            <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800 text-left space-y-2">
                                <label className="block text-[10px] font-bold uppercase text-slate-400">Hoặc dán Link Ảnh Trực Tiếp</label>
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

                    {/* Cột 2 & 3: Thông tin cơ bản & Hệ sinh thái Mạng Xã Hội */}
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

                            {/* Danh sách Mạng Xã Hội Tự Động Nhận Diện */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Hệ Sinh Thái Mạng Xã Hội</h3>
                                        <p className="text-[11px] text-slate-500">Tự động nhận diện Threads, Telegram, Zalo, WhatsApp, Instagram, X, YouTube, Discord...</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddSocial}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30 rounded-xl text-xs font-semibold hover:bg-violet-100 transition cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>Thêm Liên Kết</span>
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {socials.map((social, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-2xl border border-slate-200/70 dark:border-slate-700/50 transition-all focus-within:border-violet-500/40">
                                            {/* Icon tự động đổi theo URL */}
                                            <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs flex items-center justify-center shrink-0">
                                                {getSocialIcon(social.iconName)}
                                            </div>

                                            {/* Tên hiển thị */}
                                            <div className="w-32 shrink-0">
                                                <input
                                                    type="text"
                                                    value={social.name}
                                                    onChange={(e) => handleUpdateSocialName(idx, e.target.value)}
                                                    placeholder="Tên MXH"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none"
                                                />
                                            </div>

                                            {/* Đường dẫn URL */}
                                            <div className="flex-1 flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={social.url}
                                                    onChange={(e) => handleUpdateSocialUrl(idx, e.target.value)}
                                                    placeholder="Dán link trang cá nhân (VD: https://t.me/..., https://threads.net/@...)"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                                />

                                                {social.url && (
                                                    <a
                                                        href={social.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        title="Mở thử liên kết"
                                                        className="p-1.5 text-slate-400 hover:text-violet-600 transition shrink-0"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                )}

                                                {/* Nút Xóa */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSocial(idx)}
                                                    title="Xóa liên kết này"
                                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition shrink-0 cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    {socials.length === 0 && (
                                        <div className="text-center py-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                                            <p className="text-xs text-slate-400">Chưa có liên kết mạng xã hội nào. Bấm nút "+ Thêm Liên Kết" để tạo mới nhé anh!</p>
                                        </div>
                                    )}
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
                            value={Array.isArray(projectInfo.techStack) ? projectInfo.techStack.join(', ') : ''}
                            onChange={e => setProjectInfo({ ...projectInfo, techStack: e.target.value.split(',').map(s => s.trim()) })}
                            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3.5 py-2 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-violet-500/20"
                        />
                    </div>
                </div>
            )}

        </div>
    );
};