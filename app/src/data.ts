// Sample data matching the design. Replace with the backend API later.

export type Stage =
  | "quote"
  | "deposit"
  | "shoot"
  | "cull"
  | "edit"
  | "review"
  | "delivered";

export const STAGES: { id: Stage; label: string }[] = [
  { id: "quote", label: "Báo giá" },
  { id: "deposit", label: "Đặt cọc" },
  { id: "shoot", label: "Chụp" },
  { id: "cull", label: "Lọc" },
  { id: "edit", label: "Sửa" },
  { id: "review", label: "Duyệt" },
  { id: "delivered", label: "Giao" },
];

export type Channel = "line" | "messenger" | "zalo" | "email";

export interface Project {
  id: string;
  name: string;
  client: string;
  type: string;
  date: string;
  location: string;
  stage: Stage;
  statusLabel: string;
  tone: "orange" | "pink" | "purple" | "blue" | "green";
  note: string;
  noteTone?: "danger";
  pkg: string;
  photographers: string;
  channel: Channel;
  pairs: number;
  sizeGB: number;
  nasPath: string;
  total: number;
  paid: number;
  selectLimit: number;
  selected: number;
  cover: string;
}

export const projects: Project[] = [
  {
    id: "lan-minh",
    name: "Lan & Minh",
    client: "Trần Lan",
    type: "Chụp cưới",
    date: "18/10/2026",
    location: "Đạm Thủy",
    stage: "edit",
    statusLabel: "Chỉnh sửa",
    tone: "orange",
    note: "Hạn chỉnh sửa còn 2 ngày",
    pkg: "Gói Vàng · 60 ảnh chỉnh",
    photographers: "Huy, Ngọc",
    channel: "line",
    pairs: 624,
    sizeGB: 186,
    nasPath: "NAS/2026/10-18_Lan-Minh",
    total: 36000,
    paid: 10000,
    selectLimit: 60,
    selected: 0,
    cover: "#D8CFC4",
  },
  {
    id: "abc",
    name: "Hội thảo ABC",
    client: "Cty ABC",
    type: "Sự kiện",
    date: "12/10/2026",
    location: "Tín Nghĩa",
    stage: "review",
    statusLabel: "Chờ khách",
    tone: "pink",
    note: "Khách đã chọn 86/100 ảnh",
    pkg: "Sự kiện nửa ngày · 100 ảnh",
    photographers: "Huy",
    channel: "email",
    pairs: 310,
    sizeGB: 92,
    nasPath: "NAS/2026/10-12_ABC",
    total: 30000,
    paid: 30000,
    selectLimit: 100,
    selected: 86,
    cover: "#C7CED6",
  },
  {
    id: "moc",
    name: "Chụp sản phẩm Mộc",
    client: "Mộc Furniture",
    type: "Sản phẩm",
    date: "21/10/2026",
    location: "Studio A",
    stage: "cull",
    statusLabel: "Chọn lọc",
    tone: "purple",
    note: "240 tệp chờ lọc",
    pkg: "Sản phẩm · 40 ảnh",
    photographers: "Ngọc",
    channel: "messenger",
    pairs: 120,
    sizeGB: 36,
    nasPath: "NAS/2026/10-21_Moc",
    total: 16000,
    paid: 8000,
    selectLimit: 40,
    selected: 0,
    cover: "#CFC8D8",
  },
  {
    id: "tran",
    name: "Gia đình Trần",
    client: "Trần Hùng",
    type: "Ngoại cảnh",
    date: "21/10/2026",
    location: "Công viên Đại An",
    stage: "shoot",
    statusLabel: "Lịch chụp",
    tone: "blue",
    note: "Hôm nay 09:30",
    pkg: "Gia đình · 30 ảnh",
    photographers: "Huy",
    channel: "zalo",
    pairs: 0,
    sizeGB: 0,
    nasPath: "—",
    total: 12000,
    paid: 4000,
    selectLimit: 30,
    selected: 0,
    cover: "#C6CEC2",
  },
  {
    id: "minh-duc",
    name: "Kỷ yếu THPT Minh Đức",
    client: "THPT Minh Đức",
    type: "Kỷ yếu",
    date: "02/10/2026",
    location: "Trường Minh Đức",
    stage: "delivered",
    statusLabel: "Đã giao",
    tone: "green",
    note: "Chờ thu NT$ 18.000 · quá hạn",
    noteTone: "danger",
    pkg: "Kỷ yếu · 300 ảnh",
    photographers: "Huy, Ngọc",
    channel: "email",
    pairs: 1480,
    sizeGB: 410,
    nasPath: "NAS/2026/10-02_MinhDuc",
    total: 48000,
    paid: 30000,
    selectLimit: 300,
    selected: 300,
    cover: "#DCD3C6",
  },
];

export const todayShoots = [
  { time: "09:30", hours: "3 giờ", title: "Gia đình Trần", meta: "Ngoại cảnh · Công viên Đại An · Huy", projectId: "tran", color: "#0060DF" },
  { time: "14:00", hours: "2 giờ", title: "Chụp sản phẩm Mộc", meta: "Studio A · Ngọc", projectId: "moc", color: "#8E5BD9" },
];

export interface Thread {
  initials: string;
  name: string;
  channel: Channel;
  time: string;
  message: string;
  project: string;
  unread: boolean;
}

export const threads: Thread[] = [
  { initials: "TL", name: "Trần Lan", channel: "line", time: "10:32", message: "Bên mình có thể thêm 10 ảnh vào gói không ạ?", project: "Lan & Minh", unread: true },
  { initials: "AB", name: "Cty ABC – Chị Hằng", channel: "email", time: "09:15", message: "Đã chọn xong 86 ảnh, nhờ studio xuất bản in", project: "Hội thảo ABC", unread: true },
  { initials: "MỘ", name: "Mộc Furniture", channel: "messenger", time: "Hôm qua", message: "Lịch chụp chiều nay vẫn giữ nhé", project: "Chụp sản phẩm Mộc", unread: true },
  { initials: "TH", name: "Gia đình Trần Hùng", channel: "zalo", time: "Hôm qua", message: "Cảm ơn studio, hẹn 9 giờ 30 ở công viên", project: "Gia đình Trần", unread: true },
  { initials: "MĐ", name: "THPT Minh Đức", channel: "email", time: "T2", message: "Bạn: Gửi lại hóa đơn số 0042 để thầy kiểm tra", project: "Kỷ yếu THPT Minh Đức", unread: false },
];

export const channelInfo: Record<Channel, { label: string; color: string }> = {
  line: { label: "LINE", color: "#06A045" },
  messenger: { label: "Messenger", color: "#8E44D9" },
  zalo: { label: "Zalo", color: "#0068FF" },
  email: { label: "Email", color: "#8E8E93" },
};

export const invoices = [
  { project: "Kỷ yếu THPT Minh Đức", projectId: "minh-duc", no: "#0042", due: "hạn 16/10", amount: 18000, status: "overdue" as const },
  { project: "Lan & Minh", projectId: "lan-minh", no: "#0047", due: "đợt 2 · hạn 28/10", amount: 26000, status: "pending" as const },
  { project: "Hội thảo ABC", projectId: "abc", no: "#0045", due: "14/10", amount: 30000, status: "paid" as const },
];

export const revenue = [
  { month: "T5", value: 98000 },
  { month: "T6", value: 124000 },
  { month: "T7", value: 84000 },
  { month: "T8", value: 110000 },
  { month: "T9", value: 166000 },
  { month: "T10", value: 186000 },
];

export const nas = { usedTB: 9.9, totalTB: 16 };

export const libraryTiles = [
  "#D8CFC4", "#C7CED6", "#DCD3C6", "#CFC8D8", "#C6CEC2", "#E2DBD1",
  "#CBC3B8", "#D3D7DC", "#D6CDC0", "#C9D1CB", "#DDD4C9", "#CCC6D2",
];

export const money = (n: number) => "NT$ " + n.toLocaleString("vi-VN");
