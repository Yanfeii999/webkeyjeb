import React, { useEffect, useState } from 'react';
import { callVault, pingVault } from './core/vault.js';

const DURATION_OPTIONS = [
  { value: 0, label: '0 — Vĩnh viễn (Lifetime)' },
  { value: 7, label: '7 ngày' },
  { value: 30, label: '30 ngày' },
  { value: 90, label: '90 ngày' },
  { value: 365, label: '365 ngày' },
];

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str || '');
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function genRedeemCode() {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < 12; i++) out += B32[arr[i] % B32.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`;
}

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const raw = sessionStorage.getItem('jeb_admin_sess');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Auth views: 'login' | 'forgot' | 'force_reset'
  const [authView, setAuthView] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tempAuth, setTempAuth] = useState(null); // { email, tempHash }
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [authMsg, setAuthMsg] = useState(null); // { type: 'ok'|'error', text }
  const [authBusy, setAuthBusy] = useState(false);

  const [health, setHealth] = useState({ ok: true, msg: 'Google Sheets & Gmail Recovery: Sẵn sàng' });
  const [tab, setTab] = useState('purchase');

  // Key forms
  const [pAmount, setPAmount] = useState(1);
  const [pDays, setPDays] = useState(0);
  const [pPackage, setPPackage] = useState('LIFETIME');
  const [rAmount, setRAmount] = useState(1);
  const [rExpiresDays, setRExpiresDays] = useState(0);
  const [revokeKey, setRevokeKey] = useState('');

  // Account settings form
  const [setCurPw, setSetCurPw] = useState('');
  const [setNewPw, setSetNewPw] = useState('');
  const [setNewEmail, setSetNewEmail] = useState('');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [generatedKeys, setGeneratedKeys] = useState([]);
  const [lastMeta, setLastMeta] = useState(null);
  const [history, setHistory] = useState([]);
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [sheetKeys, setSheetKeys] = useState([]);
  const [sheetKeysLoading, setSheetKeysLoading] = useState(false);
  const [sheetKeysHint, setSheetKeysHint] = useState('');

  useEffect(() => {
    pingVault()
      .then((d) => {
        if (d.ok) setHealth({ ok: true, msg: 'Kết nối Google Sheets & Gmail Recovery: Sẵn sàng' });
      })
      .catch(() => {
        setHealth({ ok: true, msg: 'Cloud Mode (GitHub Pages → Google Sheets): Sẵn sàng' });
      });
  }, []);

  useEffect(() => {
    if (session && tab === 'revoke') {
      loadSheetKeys();
    }
  }, [session, tab]);

  async function resolveKeyTarget(rawInput) {
    const clean = (rawInput || '').trim().replace(/\s+/g, '');
    if (!clean) return null;
    if (/^[a-f0-9]{64}$/i.test(clean)) {
      return { key_hash: clean.toLowerCase(), key_code: '' };
    }
    const norm = clean.toUpperCase();
    return { key_hash: await sha256Hex(norm), key_code: norm };
  }

  async function loadSheetKeys() {
    setSheetKeysLoading(true);
    setSheetKeysHint('');
    try {
      const res = await callVault('list_keys', { limit: 100 });
      if (res.ok && Array.isArray(res.keys)) {
        setSheetKeys(res.keys);
      } else {
        setSheetKeys([]);
        setSheetKeysHint(
          'Cần cập nhật Apps Script (action list_keys) để xem danh sách trực tiếp tại đây. Bạn vẫn có thể dán mã Key hoặc key_hash vào ô trên để thu hồi/xóa.'
        );
      }
    } catch {
      setSheetKeys([]);
      setSheetKeysHint(
        'Cần cập nhật Apps Script (action list_keys) để xem danh sách trực tiếp tại đây. Bạn vẫn có thể dán mã Key hoặc key_hash vào ô trên để thu hồi/xóa.'
      );
    } finally {
      setSheetKeysLoading(false);
    }
  }

  function saveSession(obj) {
    sessionStorage.setItem('jeb_admin_sess', JSON.stringify(obj));
    setSession(obj);
  }

  function logout() {
    sessionStorage.removeItem('jeb_admin_sess');
    setSession(null);
    setAuthView('login');
    setAuthMsg(null);
    setPassword('');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setAuthMsg(null);
    setAuthBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const pwHash = await sha256Hex(password);
      const res = await callVault('admin_login', {
        email: cleanEmail,
        password_hash: pwHash,
      });

      if (!res.ok) {
        setAuthMsg({ type: 'error', text: res.error || 'Gmail Admin hoặc mật khẩu không đúng!' });
        return;
      }

      if (res.must_change_password) {
        // Logged in with temporary password from Gmail -> MUST set new password before entering!
        setTempAuth({ email: res.admin_email || cleanEmail, tempHash: pwHash });
        setNewPass('');
        setConfirmPass('');
        setPassword('');
        setAuthView('force_reset');
        setAuthMsg({
          type: 'ok',
          text: 'Mật khẩu tạm hợp lệ! Vui lòng đặt mật khẩu Admin mới để tiếp tục vào hệ thống.',
        });
        return;
      }

      saveSession({ email: res.admin_email || cleanEmail, pwHash });
      setPassword('');
    } catch (err) {
      setAuthMsg({ type: 'error', text: 'Lỗi kết nối máy chủ xác thực: ' + (err.message || err) });
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setAuthMsg(null);
    setAuthBusy(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const res = await callVault('admin_forgot_password', { email: cleanEmail });
      if (!res.ok) {
        setAuthMsg({ type: 'error', text: res.error || 'Không thể gửi mật khẩu tạm!' });
        return;
      }
      setAuthView('login');
      setPassword('');
      setAuthMsg({
        type: 'ok',
        text: res.message || `Đã gửi mật khẩu tạm đến ${cleanEmail} (hiệu lực 15 phút). Hãy kiểm tra Gmail và đăng nhập để đổi mật khẩu mới!`,
      });
    } catch (err) {
      setAuthMsg({ type: 'error', text: 'Lỗi gửi Gmail xác thực: ' + (err.message || err) });
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleForceReset(e) {
    e.preventDefault();
    setAuthMsg(null);
    if (newPass.length < 6) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự!' });
      return;
    }
    if (newPass !== confirmPass) {
      setAuthMsg({ type: 'error', text: 'Mật khẩu xác nhận không khớp!' });
      return;
    }
    setAuthBusy(true);
    try {
      const newHash = await sha256Hex(newPass);
      const res = await callVault('admin_change_password', {
        email: tempAuth.email,
        current_hash: tempAuth.tempHash,
        new_password_hash: newHash,
      });
      if (!res.ok) {
        setAuthMsg({ type: 'error', text: res.error || 'Không thể đổi mật khẩu mới!' });
        return;
      }
      // Password changed -> enter Web KeyGen Portal immediately!
      saveSession({ email: tempAuth.email, pwHash: newHash });
      setTempAuth(null);
      setNewPass('');
      setConfirmPass('');
      setNotice({ type: 'ok', text: 'Đã đổi mật khẩu Admin mới thành công và đăng nhập vào hệ thống!' });
    } catch (err) {
      setAuthMsg({ type: 'error', text: 'Lỗi cập nhật mật khẩu: ' + (err.message || err) });
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGeneratePurchase(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const amt = Math.max(1, Math.min(50, Number(pAmount) || 1));
    const days = Math.max(0, Math.min(3650, Number(pDays) || 0));
    const pkg = (pPackage || (days === 0 ? 'LIFETIME' : `VIP-${days}D`)).trim().toUpperCase();
    try {
      const keys = [];
      const seen = new Set();
      const hashes = [];
      while (keys.length < amt) {
        const k = genRedeemCode();
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
          hashes.push(await sha256Hex(k));
        }
      }
      const gs = await callVault('create_purchase_keys', {
        key_hashes: hashes,
        key_codes: keys,
        duration_days: days,
        package_type: pkg,
        created_by: session.email,
      });
      if (!gs.ok) {
        setNotice({ type: 'error', text: gs.error || 'Lỗi lưu Google Sheets!' });
        return;
      }
      setGeneratedKeys(keys);
      const meta = { kind: 'PURCHASE KEY', pkg, days, count: keys.length, time: new Date().toLocaleTimeString('vi-VN') };
      setLastMeta(meta);
      setHistory((prev) => [{ ...meta, keys }, ...prev].slice(0, 15));
      setNotice({ type: 'ok', text: `Đã tạo ${meta.count} Purchase Key (${pkg}) và đồng bộ Google Sheets thành công!` });
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối: ' + (err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateReset(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const amt = Math.max(1, Math.min(50, Number(rAmount) || 1));
    const expDays = Math.max(0, Math.min(3650, Number(rExpiresDays) || 0));
    try {
      const keys = [];
      const seen = new Set();
      const hashes = [];
      while (keys.length < amt) {
        const k = genRedeemCode();
        if (!seen.has(k)) {
          seen.add(k);
          keys.push(k);
          hashes.push(await sha256Hex(k));
        }
      }
      const expIso = expDays > 0 ? new Date(Date.now() + expDays * 86400000).toISOString() : '';
      const gs = await callVault('create_reset_keys', {
        key_hashes: hashes,
        key_codes: keys,
        expires_at: expIso,
        created_by: session.email,
      });
      if (!gs.ok) {
        setNotice({ type: 'error', text: gs.error || 'Lỗi lưu Google Sheets!' });
        return;
      }
      setGeneratedKeys(keys);
      const meta = { kind: 'RESET KEY (7 ngày)', pkg: 'RESET-7D', days: expDays, count: keys.length, time: new Date().toLocaleTimeString('vi-VN') };
      setLastMeta(meta);
      setHistory((prev) => [{ ...meta, keys }, ...prev].slice(0, 15));
      setNotice({ type: 'ok', text: `Đã tạo ${meta.count} Reset Key và đồng bộ Google Sheets thành công!` });
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối: ' + (err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(e, overrideTarget = null) {
    if (e && e.preventDefault) e.preventDefault();
    const target = await resolveKeyTarget(overrideTarget ?? revokeKey);
    if (!target) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await callVault('revoke_key', {
        key_hash: target.key_hash,
        key_code: target.key_code,
        revoked_by: session.email,
      });
      if (!res.ok) {
        setNotice({ type: 'error', text: res.error || 'Không tìm thấy key UNUSED để thu hồi!' });
        return;
      }
      if (!overrideTarget) setRevokeKey('');
      setNotice({ type: 'ok', text: `Đã thu hồi (REVOKED) key trong bảng ${res.table || 'Google Sheets'}!` });
      if (sheetKeys.length > 0) loadSheetKeys();
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối: ' + (err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteKey(overrideTarget = null) {
    const target = await resolveKeyTarget(overrideTarget ?? revokeKey);
    if (!target) return;
    if (!window.confirm('Bạn có chắc muốn XÓA HẲN key này khỏi Google Sheets?')) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await callVault('delete_key', {
        key_hash: target.key_hash,
        key_code: target.key_code,
        deleted_by: session.email,
      });
      if (!res.ok) {
        setNotice({ type: 'error', text: res.error || 'Không tìm thấy key để xóa khỏi Google Sheets!' });
        return;
      }
      if (!overrideTarget) setRevokeKey('');
      setNotice({ type: 'ok', text: `Đã xóa key khỏi bảng ${res.table || 'Google Sheets'}!` });
      loadSheetKeys();
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi kết nối: ' + (err.message || err) });
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateAccount(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const curHash = await sha256Hex(setCurPw);
      if (setNewEmail.trim()) {
        const resE = await callVault('admin_update_email', {
          email: session.email,
          current_hash: curHash,
          new_email: setNewEmail.trim().toLowerCase(),
        });
        if (!resE.ok) {
          setNotice({ type: 'error', text: resE.error || 'Đổi Gmail Admin thất bại!' });
          return;
        }
        saveSession({ ...session, email: resE.admin_email });
        setSetNewEmail('');
      }
      if (setNewPw.trim()) {
        if (setNewPw.length < 6) {
          setNotice({ type: 'error', text: 'Mật khẩu mới phải từ 6 ký tự trở lên!' });
          return;
        }
        const newH = await sha256Hex(setNewPw);
        const resP = await callVault('admin_change_password', {
          email: setNewEmail.trim() ? setNewEmail.trim().toLowerCase() : session.email,
          current_hash: curHash,
          new_password_hash: newH,
        });
        if (!resP.ok) {
          setNotice({ type: 'error', text: resP.error || 'Đổi mật khẩu thất bại!' });
          return;
        }
        saveSession({ email: setNewEmail.trim() ? setNewEmail.trim().toLowerCase() : session.email, pwHash: newH });
        setSetNewPw('');
      }
      setSetCurPw('');
      setNotice({ type: 'ok', text: 'Đã cập nhật thông tin tài khoản Admin lên Google Sheets thành công!' });
    } catch (err) {
      setNotice({ type: 'error', text: 'Lỗi cập nhật: ' + (err.message || err) });
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

  // ==================== AUTH SCREENS ====================
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#121826]/95 shadow-2xl overflow-hidden">
          <div className="bg-[#0e1117] p-4 flex justify-center border-b border-slate-800">
            <img src="./logo.jpg" alt="Jebtool" className="h-36 object-contain rounded-lg" />
          </div>

          {authView === 'login' && (
            <form onSubmit={handleLogin} className="p-6 space-y-4">
              <div className="text-center">
                <h1 className="text-xl font-bold text-amber-400 tracking-wide">JEBTOOL WEB KEYGEN</h1>
                <p className="text-xs text-slate-400 mt-1">Đăng nhập bằng Gmail Admin & Mật khẩu quản trị</p>
              </div>

              <div className="text-xs px-3 py-2 rounded-lg border flex items-center gap-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{health.msg}</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Gmail Admin</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-sky-200 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">Mật khẩu Admin (hoặc mật khẩu tạm)</label>
                  <button
                    type="button"
                    onClick={() => { setAuthView('forgot'); setAuthMsg(null); }}
                    className="text-xs text-amber-400 hover:text-amber-300 hover:underline"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu quản trị..."
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-amber-200 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              {authMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 border ${
                  authMsg.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {authMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {authBusy ? 'Đang xác thực...' : 'Đăng nhập Admin'}
              </button>
            </form>
          )}

          {authView === 'forgot' && (
            <form onSubmit={handleForgot} className="p-6 space-y-4">
              <div className="text-center">
                <h1 className="text-lg font-bold text-amber-400">QUÊN MẬT KHẨU ADMIN</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Nhập Gmail Admin để nhận <b>mật khẩu tạm</b> (hiệu lực 15 phút). Sau khi đăng nhập bằng mật khẩu tạm, bạn sẽ đặt mật khẩu mới để vào hệ thống.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Gmail Admin đã đăng ký</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@gmail.com"
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-sky-200 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>

              {authMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 border ${
                  authMsg.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {authMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {authBusy ? 'Đang gửi Gmail...' : 'Gửi mật khẩu tạm về Gmail'}
              </button>

              <button
                type="button"
                onClick={() => { setAuthView('login'); setAuthMsg(null); }}
                className="w-full py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white text-xs transition"
              >
                ← Quay lại đăng nhập
              </button>
            </form>
          )}

          {authView === 'force_reset' && (
            <form onSubmit={handleForceReset} className="p-6 space-y-4">
              <div className="text-center">
                <h1 className="text-lg font-bold text-emerald-400">ĐẶT MẬT KHẨU ADMIN MỚI</h1>
                <p className="text-xs text-slate-400 mt-1">
                  Bạn đang đăng nhập bằng mật khẩu tạm. Hãy đổi sang mật khẩu mới để mở khóa trang quản trị!
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input
                  type="password"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-amber-200 focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Xác nhận mật khẩu mới</label>
                <input
                  type="password"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới..."
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-4 py-2.5 text-sm text-amber-200 focus:outline-none focus:border-emerald-400"
                  required
                />
              </div>

              {authMsg && (
                <div className={`text-xs rounded-lg px-3 py-2 border ${
                  authMsg.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                  {authMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {authBusy ? 'Đang lưu mật khẩu mới...' : 'Lưu mật khẩu mới & Vào Portal'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // ==================== MAIN ADMIN PORTAL ====================
  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-[#121826]/90 px-5 py-4 shadow-xl">
        <div className="flex items-center gap-4">
          <img src="./logo.jpg" alt="Jebtool" className="h-12 w-12 rounded-xl object-cover border border-amber-500/40" />
          <div>
            <h1 className="text-lg md:text-xl font-bold text-amber-400">JEBTOOL — WEB KEYGEN PORTAL</h1>
            <p className="text-xs text-slate-400">Admin: <span className="text-sky-300">{session.email}</span> • Đồng bộ Google Sheets & Discord Bot</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1.5 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-300">
            ● Cloud Sheets Online
          </span>
          <button
            onClick={logout}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-400 text-slate-300 hover:text-rose-300 transition"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'purchase', label: '1. Tạo Purchase Key' },
          { id: 'reset', label: '2. Tạo Reset Key (7 ngày)' },
          { id: 'revoke', label: '3. Thu hồi & Xóa Key' },
          { id: 'account', label: '4. Gmail & Mật khẩu Admin' },
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
            <div className="space-y-4">
              <form onSubmit={handleRevoke} className="space-y-4">
                <h2 className="text-base font-bold text-slate-100">Thu hồi / Xóa Key</h2>
                <p className="text-xs text-slate-400">
                  Chuyển trạng thái của Purchase Key hoặc Reset Key đang <code className="text-amber-300">UNUSED</code> sang <code className="text-rose-400">REVOKED</code>, hoặc xóa hẳn khỏi Google Sheets.
                </p>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    Nhập mã Key (XXXX-XXXX-XXXX) hoặc dán key_hash từ Google Sheets
                  </label>
                  <input
                    type="text"
                    value={revokeKey}
                    onChange={(e) => setRevokeKey(e.target.value)}
                    placeholder="XXXX-XXXX-XXXX hoặc 64 ký tự key_hash"
                    className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-amber-300 font-mono focus:outline-none focus:border-rose-400"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
                  >
                    {busy ? 'Đang xử lý...' : 'Thu hồi (REVOKED)'}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !revokeKey.trim()}
                    onClick={() => handleDeleteKey()}
                    className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-sm transition disabled:opacity-50"
                  >
                    Xóa khỏi Sheet
                  </button>
                </div>
              </form>

              <div className="pt-3 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-300">Danh sách Key trên Google Sheets</h3>
                  <button
                    type="button"
                    onClick={loadSheetKeys}
                    disabled={sheetKeysLoading}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:border-amber-400 transition disabled:opacity-50"
                  >
                    {sheetKeysLoading ? 'Đang tải...' : 'Tải lại'}
                  </button>
                </div>

                {sheetKeysHint ? (
                  <div className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                    {sheetKeysHint}
                  </div>
                ) : sheetKeys.length === 0 ? (
                  <div className="text-xs text-slate-500 py-3 text-center rounded-xl bg-[#0b0f17] border border-slate-800">
                    {sheetKeysLoading ? 'Đang tải danh sách từ Google Sheets...' : 'Chưa có key nào trong danh sách.'}
                  </div>
                ) : (
                  <div data-allow-copy="true" className="max-h-56 overflow-y-auto space-y-1.5 rounded-xl bg-[#0b0f17] border border-slate-800 p-2">
                    {sheetKeys.map((item, idx) => {
                      const targetId = item.key_code || item.key_hash;
                      const displayCode = item.key_code || (item.key_hash ? `${item.key_hash.slice(0, 12)}...` : 'N/A');
                      return (
                        <div
                          key={`${item.table || 'T'}-${item.key_hash || idx}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#141c2c] border border-slate-800/80 px-2.5 py-1.5 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-semibold text-amber-300 truncate">{displayCode}</div>
                            <div className="text-[11px] text-slate-400">
                              {item.table} • {item.package_type || 'N/A'} •{' '}
                              <span className={item.status === 'UNUSED' ? 'text-emerald-400' : 'text-rose-400'}>
                                {item.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {item.status === 'UNUSED' && targetId && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleRevoke(null, targetId)}
                                className="px-2 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 font-medium disabled:opacity-50"
                              >
                                Thu hồi
                              </button>
                            )}
                            {targetId && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleDeleteKey(targetId)}
                                className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 font-medium disabled:opacity-50"
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'account' && (
            <form onSubmit={handleUpdateAccount} className="space-y-4">
              <h2 className="text-base font-bold text-slate-100">Cài đặt Gmail & Mật khẩu Admin</h2>
              <p className="text-xs text-slate-400">
                Gmail hiện tại: <b className="text-sky-300">{session.email}</b> (dùng để đăng nhập và nhận mật khẩu tạm khi quên mật khẩu).
              </p>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Mật khẩu hiện tại (bắt buộc)</label>
                <input
                  type="password"
                  value={setCurPw}
                  onChange={(e) => setSetCurPw(e.target.value)}
                  placeholder="Nhập mật khẩu hiện tại..."
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-amber-200 focus:outline-none focus:border-amber-400"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Đổi Gmail Admin mới (để trống nếu giữ nguyên)</label>
                <input
                  type="email"
                  value={setNewEmail}
                  onChange={(e) => setSetNewEmail(e.target.value)}
                  placeholder="gmail-moi@gmail.com"
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-sky-200 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Đổi Mật khẩu mới (để trống nếu giữ nguyên)</label>
                <input
                  type="password"
                  value={setNewPw}
                  onChange={(e) => setSetNewPw(e.target.value)}
                  placeholder="Mật khẩu mới (>= 6 ký tự)..."
                  className="w-full rounded-xl bg-[#1b2436] border border-slate-700 px-3.5 py-2 text-sm text-amber-200 focus:outline-none focus:border-amber-400"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition disabled:opacity-50"
              >
                {busy ? 'Đang lưu...' : 'Lưu cài đặt Admin'}
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

        <div className="lg:col-span-7 rounded-2xl border border-slate-800 bg-[#121826]/90 p-5 shadow-xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Danh sách Key vừa tạo {lastMeta ? `(${lastMeta.kind} • ${lastMeta.count})` : ''}
              </h2>
              <p className="text-xs text-slate-400">Mã Key (key_code) & SHA-256 hash được đồng bộ lên Google Sheets — bạn có thể xem, thu hồi hoặc xóa trực tiếp.</p>
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
