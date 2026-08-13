/**
 * ====================================================================
 * 📌 HƯỚNG DẪN TỰ ĐIỀN THÔNG TIN TÁC GIẢ ("ĐÁNH DẤU CHỦ QUYỀN DỰ ÁN CÁ NHÂN")
 * ====================================================================
 * 
 * Anh có thể tự do chỉnh sửa thông tin cá nhân dưới đây.
 * Các thông tin này sẽ hiển thị trực tiếp trên Trang Chủ (Landing Page)
 * và phần thông tin tác giả.
 * 
 * Mỗi đường dẫn trong `socials` sẽ tự động mở trang tương ứng khi click!
 */

export interface SocialLink {
  name: string;
  url: string;
  iconName: 'github' | 'linkedin' | 'facebook' | 'mail' | 'globe';
  colorClass: string;
}

export interface AuthorConfig {
  name: string;
  title: string;
  bio: string;
  avatarUrl: string;
  location: string;
  organization: string;
  socials: SocialLink[];
  projectInfo: {
    name: string;
    version: string;
    description: string;
    highlights: string[];
    techStack: string[];
  };
}

export const authorConfig: AuthorConfig = {
  // ✏️ Thay đổi Họ và Tên của Anh tại đây:
  name: "Nguyễn Mạnh Hùng",

  // ✏️ Chức danh / Vị trí chuyên môn:
  title: "Lead AI Engineer & Automation Architect",

  // ✏️ Giới thiệu ngắn về Anh hoặc dự án cá nhân này:
  bio: "Chuyên gia thiết kế các giải pháp Tự Động Hóa Doanh Nghiệp (Enterprise Automation Hub), tích hợp AI Gemini Triage, Bot Workers và điều phối tác vụ đa kênh cho Pythaverse.",

  // ✏️ Đường dẫn ảnh đại diện (Link ảnh online hoặc để ảnh avatar mẫu):
  avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80",

  // ✏️ Địa điểm & Tổ chức:
  location: "Hà Nội, Việt Nam",
  organization: "Pythaverse / DTT Corporation",

  // ✏️ ĐƯỜNG DẪN MẠNG XÃ HỘI (Click để chuyển hướng trang):
  socials: [
    {
      name: "GitHub",
      url: "https://github.com/hungnm-1225", // ✏️ Thay bằng link GitHub của Anh
      iconName: "github",
      colorClass: "hover:text-slate-100 hover:border-slate-500",
    },
    {
      name: "LinkedIn",
      url: "https://linkedin.com/in/nguyenmanhhung", // ✏️ Thay bằng link LinkedIn của Anh
      iconName: "linkedin",
      colorClass: "hover:text-blue-400 hover:border-blue-500/40",
    },
    {
      name: "Facebook",
      url: "https://facebook.com/hung.nguyenmanh", // ✏️ Thay bằng link Facebook của Anh
      iconName: "facebook",
      colorClass: "hover:text-blue-500 hover:border-blue-600/40",
    },
    {
      name: "Email",
      url: "mailto:hungnm@dtt.vn", // ✏️ Thay bằng Email của Anh
      iconName: "mail",
      colorClass: "hover:text-rose-400 hover:border-rose-500/40",
    },
    {
      name: "Portfolio / Website",
      url: "https://pythaverse.space", // ✏️ Thay bằng link Website cá nhân
      iconName: "globe",
      colorClass: "hover:text-cyan-400 hover:border-cyan-500/40",
    },
  ],

  // ✏️ Thông tin tổng quan dự án hiển thị ở Trang Chủ:
  projectInfo: {
    name: "PTV Tasks Administrator",
    version: "v1.0.0 Enterprise Release",
    description: "Hệ thống Trung Tâm Điều Phối & Tự Động Hóa Tác Vụ Nội Bộ Pythaverse. Tích hợp Gmail Workspace, Google Form, OS Ticket với Gemini AI Triage Engine.",
    highlights: [
      "Gemini AI Auto-Triage & Summarization",
      "Human-in-the-Loop Bot Approval Queue",
      "Multi-Worker Cloud Execution (Keycloak, LMS Playwright, GitHub REST)",
      "Google Workspace & Telegram Mini App Integration",
    ],
    techStack: [
      "React 19 SPA",
      "FastAPI 0.115",
      "Supabase DB & Auth",
      "Tailwind CSS v4",
      "Gemini 2.5 Flash AI",
    ],
  },
};
