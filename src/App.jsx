import React, { useEffect, useState } from 'react';

const DURATION_OPTIONS = [
  { value: 0, label: '0 — Vĩnh viễn (Lifetime)' },
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
  { value: 365, label: '365 ngày' },
];

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('jeb_admin_tok') || '');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [health, setHealth] = useState({ checked: false, ok: false, msg: 'Đang kiểm tra C# Server...' });
  const [tab, setTab] = useState('purchase');

  // Purchase form
  const [pAmount, setPAmount] = useState(1);
  const [pDays, setPDays] = useState(0);
  const [pPackage, setPPackage] = useState('LIFETIME');

  // Reset form
  const [rAmount, setRAmount] = useState(1);
  const [rExpiresDays, setRExpiresDays] = useState(0);

  // Revoke form
  const [revokeKey, setRevokeKey] = useState('');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [lastMeta, setLastMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(-1);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setHealth({ checked: true, ok: true, msg: 'C# Backend + Google Sheets: Sẵn sàng' });
        else setHealth({ checked: true, ok: false, msg: d.error || 'Lỗi kết nối' });
      })
      .catch(() => {
        setHealth({ checked: true, ok: false, msg: 'Chưa bật C# Server (hãy chạy start-webkey.bat)' });
      });
  }, []);

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ ok: false, error: 'Phản hồi không hợp lệ' }));
    if (res.status === 401) {
      sessionStorage.removeItem('jeb_admin_tok');
      setToken('');
    }
    return data;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginErr('');
    setLoginBusy(true);
    try {
      const res = await apiPost('/api/login', { password });
      if (res.ok && res.token) {
        sessionStorage.setItem('jeb_admin_tok', res.token);
        setToken(res.token);
        setPassword('');
      } else {
        setLoginErr(res.error || 'Mật khẩu Admin không đúng!');
      }
    } catch {
      setLoginErr('Không thể kết nối C# Backend Server!');
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleGeneratePurchase(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiPost('/api/keys/purchase', {
        amount: Number(pAmount),
        duration_days: Number(pDays),
        package_type: (pPackage || (Number(pDays) === 0 ? 'LIFETIME' : `VIP-${pDays}D`)).trim().toUpperCase(),
      });
      if (!res.ok) {
        setNotice({ type: 'error', text: res.error || 'Tạo Purchase Key thất bại!' });
        return;
      }
      setGeneratedKeys(res.keys || []);
      const meta = {
        kind: 'PURCHASE KEY',
        pkg: res.package_type,
        days: res.duration_days,
        count: (res.keys || []).length,
        time: new Date().toLocaleTimeString('vi-VN'),
      };
      setLastMeta(meta);
      setHistory((prev) => [{ ...meta, keys: res.keys || [] }, ...prev].slice(0, 15));
      setNotice({ type: 'ok', text: `Đã tạo ${meta.count} Purchase Key (${meta.pkg}) và đồng bộ Google Sheets thành công!` });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateReset(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiPost('/api/keys/reset', {
        amount: Number(rAmount),
        expires_days: Number(rExpiresDays),
      });
      if (!res.ok) {
        setNotice({ type: 'error', text: res.error || 'Tạo Reset Key thất bại!' });
        return;
      }
      setGeneratedKeys(res.keys || []);
      const meta = {
        kind: 'RESET KEY (7 ngày)',
        pkg: 'RESET-7D',
        days: Number(rExpiresDays),
        count: (res.keys || []).length,
        time: new Date().toLocaleTimeString('vi-VN'),
      };
      setLastMeta(meta);
      setHistory((prev) => [{ ...meta, keys: res.keys || [] }, ...prev].slice(0, 15));
      setNotice({ type: 'ok', text: `Đã tạo ${meta.count} Reset Key và đồng bộ Google Sheets thành công!` });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(e) {
    e.preventDefault();
    if (!revokeKey.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiPost('/api/keys/revoke', { key: revokeKey.trim() });
      if (!res.ok) {
        setNotice({ type: 'error', text: res.error || 'Không tìm thấy key UNUSED để thu hồi!' });
        return;
      }
      setRevokeKey('');
      setNotice({ type: 'ok', text: `Đã thu hồi (REVOKED) key trong bảng ${res.table || 'Google Sheets'}!` });
    } finally {
      setBusy(false);
    }
  }

  function copyText(txt, idx = -2) {
    navigator.clipboard.writeText(txt).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(-1), 1600);
    });
  }

  function downloadTxt() {
    if (!generatedKeys.length) return;
    const blob = new Blob([generatedKeys.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jebtool-keys-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#121826]/95 shadow-2xl overflow-hidden">
          <div className="bg-[#0e1117] p-4 flex justify-center border-b border-slate-800">
            <img src="./logo.jpg" alt="Jebtool" className="h-36 object-contain rounded-lg" />
          </div>
          <form onSubmit={handleLogin} className="p-6 space-y-4">
            <div className="text-center">
              <h1 className="text-xl font-bold text-amber-400 tracking-wide">JEBTOOL WEB KEYGEN</h1>
              <p className="text-xs text-slate-400 mt-1">Đăng nhập quản trị để tạo Key Redeem đồng bộ Google Sheets</p>
            </div>

            <div className={`text-xs px-3 py-2 rounded-lg border flex items-center gap-2 ${
              health.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${health.ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span>{health.msg}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Mật khẩu Admin</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu quản trị..."
                className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-amber-200 focus:outline-none focus:border-amber-400"
                autoFocus
                required
              />
            </div>

            {loginErr && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {loginErr}
              </div>
            )}

            <button
              type="submit"
              disabled={loginBusy}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
            >
              {loginBusy ? 'Đang xác thực...' : 'Đăng nhập Admin'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#121826]/90 px-5 py-4 shadow-xl">
        <div className="flex items-center gap-4">
          <img src="./logo.jpg" alt="Jebtool" className="h-12 w-12 rounded-xl object-cover border border-amber-500/40" />
          <div>
            <h1 className="text-lg md:text-xl font-bold text-amber-400">JEBTOOL — WEB KEYGEN PORTAL</h1>
            <p className="text-xs text-slate-400">Tạo Key Redeem ngẫu nhiên không trùng lặp → Đồng bộ trực tiếp Google Sheets & Discord Bot</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-3 py-1.5 rounded-full border ${
            health.ok
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {health.ok ? '● C# API Online' : '● Offline'}
          </span>
          <button
            onClick={() => { sessionStorage.removeItem('jeb_admin_tok'); setToken(''); }}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-300 transition"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'purchase', label: '1. Tạo Purchase Key (Mua Tool)' },
          { id: 'reset', label: '2. Tạo Reset Key (Cooldown 7 ngày)' },
          { id: 'revoke', label: '3. Thu hồi Key (Revoke)' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setNotice(null); }}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
              tab === t.id
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                : 'bg-[#121826] text-slate-300 border-slate-800 hover:border-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-800 bg-[#121826]/90 p-5 shadow-xl space-y-4">
          {tab === 'purchase' && (
            <form onSubmit={handleGeneratePurchase} className="space-y-4">
              <h2 className="text-base font-bold text-slate-100">Tạo Purchase Key (TYPE 1)</h2>
              <p className="text-xs text-slate-400">
                Khách nhập <code className="text-amber-300">/redeem key:XXXX-XXXX-XXXX</code> → tự lên Role <b>Vip</b> (cooldown 14 ngày) → dùng <code className="text-sky-300">/reset-hwid</code> để lấy Key mở <b>Jebtool.exe</b>.
              </p>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Số lượng Key (1–50)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={pAmount}
                  onChange={(e) => setPAmount(e.target.value)}
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Thời hạn License</label>
                <select
                  value={pDays}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPDays(v);
                    setPPackage(v === 0 ? 'LIFETIME' : `VIP-${v}D`);
                  }}
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  {DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Tên gói (Package Type)</label>
                <input
                  type="text"
                  value={pPackage}
                  onChange={(e) => setPPackage(e.target.value)}
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-sky-300 font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {busy ? 'Đang tạo & đồng bộ Sheets...' : 'Tạo Purchase Key & Lưu Google Sheets'}
              </button>
            </form>
          )}

          {tab === 'reset' && (
            <form onSubmit={handleGenerateReset} className="space-y-4">
              <h2 className="text-base font-bold text-slate-100">Tạo Reset Key (TYPE 2)</h2>
              <p className="text-xs text-slate-400">
                Dùng 1 lần cho khách đã có Purchase License → kích hoạt quyền <b>RESET CODE</b> (giảm cooldown từ 14 ngày xuống <b>7 ngày</b> + cộng dồn 1 lượt reset).
              </p>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Số lượng Reset Key (1–50)</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={rAmount}
                  onChange={(e) => setRAmount(e.target.value)}
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Hạn sử dụng của Reset Key</label>
                <select
                  value={rExpiresDays}
                  onChange={(e) => setRExpiresDays(Number(e.target.value))}
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value={0}>0 — Không hết hạn</option>
                  <option value={7}>7 ngày kể từ hôm nay</option>
                  <option value={30}>30 ngày kể từ hôm nay</option>
                  <option value={90}>90 ngày kể từ hôm nay</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {busy ? 'Đang tạo & đồng bộ Sheets...' : 'Tạo Reset Key & Lưu Google Sheets'}
              </button>
            </form>
          )}

          {tab === 'revoke' && (
            <form onSubmit={handleRevoke} className="space-y-4">
              <h2 className="text-base font-bold text-slate-100">Thu hồi Key chưa sử dụng</h2>
              <p className="text-xs text-slate-400">
                Chuyển trạng thái của một Purchase Key hoặc Reset Key đang <code className="text-amber-300">UNUSED</code> sang <code className="text-rose-400">REVOKED</code>.
              </p>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Nhập mã Key cần thu hồi</label>
                <input
                  type="text"
                  value={revokeKey}
                  onChange={(e) => setRevokeKey(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX"
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-amber-300 font-mono uppercase focus:outline-none focus:border-rose-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-sm transition disabled:opacity-50"
              >
                {busy ? 'Đang xử lý...' : 'Thu hồi Key (REVOKED)'}
              </button>
            </form>
          )}

          {notice && (
            <div className={`text-xs px-3.5 py-2.5 rounded-xl border ${
              notice.type === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {notice.text}
            </div>
          )}
        </div>

        {/* Right Output */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#121826]/90 p-5 shadow-xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Danh sách Key vừa tạo {lastMeta ? `(${lastMeta.kind} • ${lastMeta.count})` : ''}
              </h2>
              <p className="text-xs text-slate-400">Chỉ SHA-256 hash được lưu trên Google Sheets — hãy sao chép mã bên dưới để gửi khách.</p>
            </div>
            {generatedKeys.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => copyText(generatedKeys.join('\n'), -2)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-semibold"
                >
                  {copiedIdx === -2 ? 'Đã copy tất cả ✓' : 'Copy tất cả'}
                </button>
                <button
                  onClick={downloadTxt}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-slate-500"
                >
                  Tải .txt
                </button>
              </div>
            )}
          </div>

          <div data-allow-copy="true" className="flex-1 min-h-[220px] max-h-[340px] overflow-y-auto rounded-xl bg-[#0b0f17] border border-slate-800 p-3 space-y-2">
            {generatedKeys.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 py-16">
                Chưa có key nào được tạo trong phiên này.
              </div>
            ) : (
              generatedKeys.map((k, idx) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#141c2c] border border-slate-800/80 px-3.5 py-2"
                >
                  <span className="font-mono text-sm font-bold text-amber-300 tracking-wider select-all">{k}</span>
                  <button
                    onClick={() => copyText(k, idx)}
                    className="text-xs px-2.5 py-1 rounded-md bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 transition font-medium"
                  >
                    {copiedIdx === idx ? 'Đã copy ✓' : 'Copy'}
                  </button>
                </div>
              ))
            )}
          </div>

          {history.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              <div className="text-xs font-semibold text-slate-400 mb-2">Lịch sử tạo gần đây</div>
              <div className="space-y-1.5 max-h-28 overflow-y-auto">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-[#0d1320] px-3 py-1.5 rounded-lg border border-slate-800/60">
                    <span className="text-slate-300">
                      <b className="text-amber-400">{h.kind}</b> • {h.count} key ({h.pkg})
                    </span>
                    <span className="text-slate-500">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
