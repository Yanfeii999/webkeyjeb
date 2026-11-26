using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

[assembly: AssemblyTitle("Jebtool WebKey C# Server")]
[assembly: AssemblyDescription("Jebtool Admin Web KeyGen Backend API (Obfuscated C#)")]
[assembly: AssemblyProduct("Jebtool WebKey")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace __NS__ {
    internal static class __CLS__ {
        private const string B32 = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        private static readonly byte[] SessionKey = CreateRandomBytes(32);

        private static byte[] CreateRandomBytes(int len) {
            byte[] b = new byte[len];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider()) rng.GetBytes(b);
            return b;
        }

        private static string __DEC__(byte[] d, byte k) {
            byte[] o = new byte[d.Length];
            for (int i = 0; i < d.Length; i++) o[i] = (byte)(d[i] ^ k ^ ((i * 23 + 7) & 0xFF));
            return Encoding.UTF8.GetString(o);
        }

        private static string Sha256Hex(string input) {
            using (SHA256 sha = SHA256.Create()) {
                byte[] h = sha.ComputeHash(Encoding.UTF8.GetBytes(input ?? ""));
                StringBuilder sb = new StringBuilder(h.Length * 2);
                for (int i = 0; i < h.Length; i++) sb.Append(h[i].ToString("x2"));
                return sb.ToString();
            }
        }

        private static string GenerateRedeemCode() {
            byte[] bytes = CreateRandomBytes(12);
            char[] c = new char[12];
            for (int i = 0; i < 12; i++) c[i] = B32[bytes[i] % B32.Length];
            string s = new string(c);
            return s.Substring(0, 4) + "-" + s.Substring(4, 4) + "-" + s.Substring(8, 4);
        }

        private static string IssueToken() {
            long exp = DateTimeOffset.UtcNow.AddHours(12).ToUnixTimeSeconds();
            string payload = "admin." + exp;
            using (HMACSHA256 h = new HMACSHA256(SessionKey)) {
                string sig = Convert.ToBase64String(h.ComputeHash(Encoding.UTF8.GetBytes(payload)));
                return Convert.ToBase64String(Encoding.UTF8.GetBytes(payload + "|" + sig));
            }
        }

        private static bool VerifyToken(string authHeader) {
            if (string.IsNullOrWhiteSpace(authHeader) || !authHeader.StartsWith("Bearer ")) return false;
            try {
                string raw = Encoding.UTF8.GetString(Convert.FromBase64String(authHeader.Substring(7).Trim()));
                int idx = raw.LastIndexOf('|');
                if (idx <= 0) return false;
                string payload = raw.Substring(0, idx);
                string sig = raw.Substring(idx + 1);
                string[] parts = payload.Split('.');
                long exp;
                if (parts.Length != 2 || !long.TryParse(parts[1], out exp)) return false;
                if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp) return false;
                using (HMACSHA256 h = new HMACSHA256(SessionKey)) {
                    string expected = Convert.ToBase64String(h.ComputeHash(Encoding.UTF8.GetBytes(payload)));
                    return sig == expected;
                }
            } catch {
                return false;
            }
        }

        private static string PostToSheets(string jsonBody) {
            ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768;
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(__S_GASURL__);
            req.Method = "POST";
            req.ContentType = "application/json; charset=utf-8";
            req.AllowAutoRedirect = true;
            req.Timeout = 25000;
            byte[] data = Encoding.UTF8.GetBytes(jsonBody);
            req.ContentLength = data.Length;
            using (Stream s = req.GetRequestStream()) s.Write(data, 0, data.Length);
            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8)) {
                return sr.ReadToEnd();
            }
        }

        private static string JsonEscape(string s) {
            if (s == null) return "";
            return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "\\r").Replace("\n", "\\n");
        }

        private static string ExtractJsonString(string json, string key) {
            Match m = Regex.Match(json ?? "", "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
            if (!m.Success) return "";
            return m.Groups[1].Value.Replace("\\\"", "\"").Replace("\\\\", "\\");
        }

        private static int ExtractJsonInt(string json, string key, int defVal) {
            Match m = Regex.Match(json ?? "", "\"" + Regex.Escape(key) + "\"\\s*:\\s*(-?\\d+)");
            int v;
            return (m.Success && int.TryParse(m.Groups[1].Value, out v)) ? v : defVal;
        }

        private static void WriteJson(HttpListenerResponse resp, int status, string json) {
            resp.StatusCode = status;
            resp.ContentType = "application/json; charset=utf-8";
            byte[] buf = Encoding.UTF8.GetBytes(json);
            resp.ContentLength64 = buf.Length;
            using (Stream os = resp.OutputStream) os.Write(buf, 0, buf.Length);
        }

        private static string GetMime(string filePath) {
            string ext = Path.GetExtension(filePath).ToLowerInvariant();
            if (ext == ".html") return "text/html; charset=utf-8";
            if (ext == ".js") return "application/javascript; charset=utf-8";
            if (ext == ".css") return "text/css; charset=utf-8";
            if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
            if (ext == ".png") return "image/png";
            if (ext == ".svg") return "image/svg+xml";
            if (ext == ".ico") return "image/x-icon";
            return "application/octet-stream";
        }

        private static void HandleRequest(HttpListenerContext ctx, string distDir) {
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse resp = ctx.Response;
            string path = (req.Url.AbsolutePath ?? "/").TrimEnd('/');
            if (string.IsNullOrEmpty(path)) path = "/";

            try {
                // API Routes
                if (path == "/api/health" && req.HttpMethod == "GET") {
                    WriteJson(resp, 200, "{\"ok\":true,\"service\":\"Jebtool WebKey C# Backend\"}");
                    return;
                }

                if (path == "/api/login" && req.HttpMethod == "POST") {
                    string body;
                    using (StreamReader sr = new StreamReader(req.InputStream, Encoding.UTF8)) body = sr.ReadToEnd();
                    string pw = ExtractJsonString(body, "password");
                    string expectedHash = __S_ADMINHASH__;
                    if (Sha256Hex(pw) == expectedHash) {
                        WriteJson(resp, 200, "{\"ok\":true,\"token\":\"" + IssueToken() + "\"}");
                    } else {
                        WriteJson(resp, 401, "{\"ok\":false,\"error\":\"Mật khẩu Admin không đúng!\"}");
                    }
                    return;
                }

                if (path.StartsWith("/api/keys/")) {
                    if (!VerifyToken(req.Headers["Authorization"])) {
                        WriteJson(resp, 401, "{\"ok\":false,\"error\":\"Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.\"}");
                        return;
                    }
                    string body;
                    using (StreamReader sr = new StreamReader(req.InputStream, Encoding.UTF8)) body = sr.ReadToEnd();

                    if (path == "/api/keys/purchase" && req.HttpMethod == "POST") {
                        int amount = Math.Max(1, Math.Min(50, ExtractJsonInt(body, "amount", 1)));
                        int days = Math.Max(0, Math.Min(3650, ExtractJsonInt(body, "duration_days", 0)));
                        string pkg = ExtractJsonString(body, "package_type").Trim().ToUpperInvariant();
                        if (string.IsNullOrEmpty(pkg)) pkg = (days == 0) ? "LIFETIME" : ("VIP-" + days + "D");

                        HashSet<string> seen = new HashSet<string>();
                        List<string> keys = new List<string>();
                        List<string> hashes = new List<string>();
                        while (keys.Count < amount) {
                            string k = GenerateRedeemCode();
                            if (seen.Add(k)) {
                                keys.Add("\"" + k + "\"");
                                hashes.Add("\"" + Sha256Hex(k) + "\"");
                            }
                        }
                        string payload = "{\"secret\":\"" + __S_GASSEC__ + "\",\"action\":\"create_purchase_keys\",\"key_hashes\":[" +
                                         string.Join(",", hashes.ToArray()) + "],\"key_codes\":[" +
                                         string.Join(",", keys.ToArray()) + "],\"duration_days\":" + days +
                                         ",\"package_type\":\"" + JsonEscape(pkg) + "\",\"created_by\":\"WEB_KEYGEN\"}";
                        string gsResp = PostToSheets(payload);
                        if (gsResp.Contains("\"ok\":true")) {
                            WriteJson(resp, 200, "{\"ok\":true,\"package_type\":\"" + JsonEscape(pkg) + "\",\"duration_days\":" + days + ",\"keys\":[" + string.Join(",", keys.ToArray()) + "]}");
                        } else {
                            WriteJson(resp, 502, "{\"ok\":false,\"error\":\"Lỗi Google Sheets: " + JsonEscape(gsResp) + "\"}");
                        }
                        return;
                    }

                    if (path == "/api/keys/reset" && req.HttpMethod == "POST") {
                        int amount = Math.Max(1, Math.Min(50, ExtractJsonInt(body, "amount", 1)));
                        int expDays = Math.Max(0, Math.Min(3650, ExtractJsonInt(body, "expires_days", 0)));
                        string expIso = expDays > 0 ? DateTime.UtcNow.AddDays(expDays).ToString("o") : "";

                        HashSet<string> seen = new HashSet<string>();
                        List<string> keys = new List<string>();
                        List<string> hashes = new List<string>();
                        while (keys.Count < amount) {
                            string k = GenerateRedeemCode();
                            if (seen.Add(k)) {
                                keys.Add("\"" + k + "\"");
                                hashes.Add("\"" + Sha256Hex(k) + "\"");
                            }
                        }
                        string payload = "{\"secret\":\"" + __S_GASSEC__ + "\",\"action\":\"create_reset_keys\",\"key_hashes\":[" +
                                         string.Join(",", hashes.ToArray()) + "],\"key_codes\":[" +
                                         string.Join(",", keys.ToArray()) + "],\"expires_at\":\"" + JsonEscape(expIso) + "\",\"created_by\":\"WEB_KEYGEN\"}";
                        string gsResp = PostToSheets(payload);
                        if (gsResp.Contains("\"ok\":true")) {
                            WriteJson(resp, 200, "{\"ok\":true,\"keys\":[" + string.Join(",", keys.ToArray()) + "]}");
                        } else {
                            WriteJson(resp, 502, "{\"ok\":false,\"error\":\"Lỗi Google Sheets: " + JsonEscape(gsResp) + "\"}");
                        }
                        return;
                    }

                    if (path == "/api/keys/revoke" && req.HttpMethod == "POST") {
                        string rawKey = ExtractJsonString(body, "key").Trim().ToUpperInvariant().Replace(" ", "");
                        if (string.IsNullOrEmpty(rawKey)) {
                            WriteJson(resp, 400, "{\"ok\":false,\"error\":\"Thiếu mã Key cần thu hồi.\"}");
                            return;
                        }
                        string payload = "{\"secret\":\"" + __S_GASSEC__ + "\",\"action\":\"revoke_key\",\"key_hash\":\"" +
                                         Sha256Hex(rawKey) + "\",\"revoked_by\":\"WEB_KEYGEN\"}";
                        string gsResp = PostToSheets(payload);
                        WriteJson(resp, 200, gsResp);
                        return;
                    }
                }

                // Static file serving from dist/
                string rel = path == "/" ? "index.html" : path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                string full = Path.GetFullPath(Path.Combine(distDir, rel));
                if (!full.StartsWith(distDir, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) {
                    full = Path.Combine(distDir, "index.html");
                }
                if (File.Exists(full)) {
                    byte[] data = File.ReadAllBytes(full);
                    resp.StatusCode = 200;
                    resp.ContentType = GetMime(full);
                    resp.ContentLength64 = data.Length;
                    using (Stream os = resp.OutputStream) os.Write(data, 0, data.Length);
                } else {
                    WriteJson(resp, 404, "{\"ok\":false,\"error\":\"Not Found\"}");
                }
            } catch (Exception ex) {
                try { WriteJson(resp, 500, "{\"ok\":false,\"error\":\"" + JsonEscape(ex.Message) + "\"}"); } catch { }
            }
        }

        static void Main(string[] args) {
            int port = 5050;
            if (args != null && args.Length > 0) int.TryParse(args[0], out port);

            string exeDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string distDir = Path.GetFullPath(Path.Combine(exeDir, "..", "dist"));
            if (!Directory.Exists(distDir)) distDir = Path.Combine(exeDir, "dist");

            HttpListener listener = new HttpListener();
            listener.Prefixes.Add("http://localhost:" + port + "/");
            listener.Start();
            Console.WriteLine("[Jebtool WebKey C# Server] Running at http://localhost:" + port + "/");
            Console.WriteLine("[Jebtool WebKey C# Server] Serving obfuscated React+Tailwind from: " + distDir);

            while (true) {
                HttpListenerContext ctx = listener.GetContext();
                ThreadPool.QueueUserWorkItem(delegate(object state) {
                    HandleRequest((HttpListenerContext)state, distDir);
                }, ctx);
            }
        }
    }
}
