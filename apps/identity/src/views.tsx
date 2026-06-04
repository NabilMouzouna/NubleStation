/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";

const STYLES = `
  :root {
    --bg: #f6f7fb; --card: #ffffff; --text: #0a1317; --muted: #5d6c7b;
    --border: #dee3e9; --accent: #6b48f5; --accent-hover: #5236d4;
    --danger: #e41e3f; --field: #fbfbfd; --success: #31a24c;
    /* brand gradient — from packages/ui tokens (logo-light.png) */
    --brand1: #4f6bf6; --brand2: #9b40f8; --brand3: #b84ff5;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: Inter, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text);
    padding: 24px;
  }
  .card {
    width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border);
    border-radius: 16px; padding: 30px 32px 22px; box-shadow: 0 8px 30px rgba(15,18,34,0.06);
  }
  .logo-wrap { text-align: center; margin-bottom: 24px; }
  .logo { height: 30px; width: auto; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.02em; text-align: center; }
  .sub { color: var(--muted); font-size: 13px; margin: 0 0 22px; text-align: center; }
  label { display: block; font-size: 12.5px; font-weight: 500; margin: 0 0 6px; }
  input[type=text], input[type=email], input[type=password] {
    width: 100%; height: 40px; padding: 0 12px; font-size: 14px; color: var(--text);
    background: var(--field); border: 1px solid var(--border); border-radius: 9px; outline: none;
  }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(109,40,217,0.12); }
  .field { margin-bottom: 16px; }
  button {
    width: 100%; height: 42px; margin-top: 6px; border: 0; border-radius: 10px; cursor: pointer;
    background: var(--accent); color: #fff; font-size: 14px; font-weight: 600; transition: background .15s;
  }
  button:hover { background: var(--accent-hover); }
  .alt { margin-top: 18px; font-size: 13px; color: var(--muted); text-align: center; }
  .alt a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .error {
    background: rgba(220,38,38,0.08); color: var(--danger); border: 1px solid rgba(220,38,38,0.2);
    border-radius: 9px; padding: 10px 12px; font-size: 13px; margin-bottom: 18px;
  }
  .app-chip {
    display: flex; width: fit-content; margin: 0 auto 18px; align-items: center; gap: 6px;
    background: rgba(109,40,217,0.08); color: var(--accent); border-radius: 999px;
    padding: 4px 12px; font-size: 12px; font-weight: 500;
  }
  .msg-icon { font-size: 34px; margin-bottom: 10px; text-align: center; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .row-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); }

  /* iOS-style avatar upload box */
  .avatar-field { display: flex; flex-direction: column; align-items: center; margin-bottom: 20px; }
  .avatar-box {
    position: relative; width: 104px; height: 104px; border-radius: 26px; overflow: hidden;
    cursor: pointer; border: 1px solid var(--border); box-shadow: 0 2px 10px rgba(15,18,34,0.1);
    transition: transform .12s, box-shadow .12s;
  }
  .avatar-box:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(109,40,217,0.18); }
  .avatar-box img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .avatar-overlay {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 6px 7px; font-size: 9.5px;
    font-weight: 600; letter-spacing: .02em; text-align: center; color: #fff;
    background: linear-gradient(transparent, rgba(0,0,0,0.78));
  }
  .avatar-hint { margin-top: 9px; font-size: 11.5px; color: var(--muted); }

  /* powered-by footer */
  .powered {
    margin-top: 26px; padding-top: 16px; border-top: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center; gap: 6px;
    font-size: 11px; color: var(--muted);
  }
  .powered img { height: 15px; width: auto; }
  .powered .id-name { font-weight: 600; color: var(--text); }

  /* ── Instagram-style profile card ──────────────────────────────────────── */
  .card.wide { max-width: 440px; }
  .cover {
    height: 84px; margin: -8px -32px 0; border-radius: 14px 14px 0 0;
    background: linear-gradient(120deg, var(--brand1), var(--brand2) 55%, var(--brand3));
  }
  .pf-head { display: flex; flex-direction: column; align-items: center; margin-top: -50px; }
  .pf-avatar {
    width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
    border: 4px solid var(--card); background: var(--card);
    box-shadow: 0 4px 16px rgba(10,19,23,0.16);
  }
  .pf-name { font-size: 21px; font-weight: 700; letter-spacing: -0.02em; margin: 12px 0 2px; }
  .pf-email { font-size: 13px; color: var(--muted); margin: 0; }
  .pf-badge {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 10px;
    padding: 3px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 600;
  }
  .pf-badge.admin  { background: rgba(107,72,245,0.12); color: var(--accent); }
  .pf-badge.member { background: var(--muted); color: var(--muted-foreground, #5d6c7b); }
  .pf-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .pf-stats {
    display: flex; margin: 22px 0 4px; border: 1px solid var(--border); border-radius: 14px;
    overflow: hidden; background: #fcfcfe;
  }
  .pf-stat { flex: 1; text-align: center; padding: 13px 6px; }
  .pf-stat + .pf-stat { border-left: 1px solid var(--border); }
  .pf-stat .num { font-size: 17px; font-weight: 700; color: var(--text); line-height: 1.1; }
  .pf-stat .lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin-top: 3px; }

  .pf-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 22px 0 10px; font-weight: 600; }
  .pf-apps { display: flex; flex-wrap: wrap; gap: 8px; }
  .pf-app {
    display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px;
    border: 1px solid var(--border); border-radius: 999px; font-size: 12.5px; background: var(--card);
  }
  .pf-app .role { color: var(--muted); font-size: 11px; }
  .pf-empty { font-size: 13px; color: var(--muted); }

  .pf-actions { display: flex; gap: 10px; margin-top: 24px; }
  .btn-outline {
    flex: 1; height: 40px; border: 1px solid var(--border); background: var(--card); color: var(--text);
    border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: border-color .12s, background .12s;
  }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
  .btn-ghost {
    height: 40px; padding: 0 16px; border: 0; background: transparent; color: var(--muted);
    border-radius: 10px; font-size: 13.5px; font-weight: 600; cursor: pointer; width: auto; margin: 0;
  }
  .btn-ghost:hover { color: var(--danger); background: rgba(228,30,63,0.06); }

  /* ── Edit modal ────────────────────────────────────────────────────────── */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(10,19,23,0.45); backdrop-filter: blur(2px);
    display: none; align-items: center; justify-content: center; padding: 20px; z-index: 50;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    width: 100%; max-width: 400px; background: var(--card); border-radius: 18px; padding: 26px 28px;
    box-shadow: 0 20px 60px rgba(10,19,23,0.3); max-height: 92vh; overflow-y: auto;
  }
  .modal h2 { font-size: 17px; margin: 0 0 18px; letter-spacing: -0.01em; }
  .pw-toggle {
    width: 100%; text-align: left; background: transparent; color: var(--accent); border: 0; padding: 0;
    font-size: 12.5px; font-weight: 600; cursor: pointer; margin: 2px 0 14px; height: auto;
  }
  .pw-fields { display: none; }
  .pw-fields.open { display: block; }
  .modal-actions { display: flex; gap: 10px; margin-top: 8px; }
  .modal-actions .btn-outline { margin: 0; }
`;

// Tiny client script: live-preview the chosen avatar in the box.
const AVATAR_SCRIPT = `
  (function(){
    var inp = document.getElementById('avatar-input');
    if(!inp) return;
    inp.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      if(!f) return;
      document.getElementById('avatar-preview').src = URL.createObjectURL(f);
      var ov = document.getElementById('avatar-overlay');
      if(ov){ ov.textContent = 'Change photo'; }
    });
  })();
`;

export const Layout: FC<PropsWithChildren<{ title: string; wide?: boolean }>> = ({
  title, wide, children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <link rel="icon" type="image/svg+xml" href="/assets/identity.svg" />
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
    </head>
    <body>
      <div class={wide ? "card wide" : "card"}>
        <div class="logo-wrap">
          {/* NubleStation brand logo */}
          <img class="logo" src="/assets/logo-light.png" alt="NubleStation" />
        </div>
        {children}
        <div class="powered">
          powered by
          <img src="/assets/identity.svg" alt="" />
          <span class="id-name">Identity</span>
        </div>
      </div>
    </body>
  </html>
);

const AppChip: FC<{ app?: string }> = ({ app }) =>
  app ? <div class="app-chip">🔐 Continue to {app}</div> : null;

const Hidden: FC<{ app?: string; redirectUri?: string }> = ({ app, redirectUri }) => (
  <>
    {app ? <input type="hidden" name="app" value={app} /> : null}
    {redirectUri ? <input type="hidden" name="redirect_uri" value={redirectUri} /> : null}
  </>
);

function qs(app?: string, redirectUri?: string): string {
  const p = new URLSearchParams();
  if (app) p.set("app", app);
  if (redirectUri) p.set("redirect_uri", redirectUri);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const LoginPage: FC<{ app?: string; redirectUri?: string; error?: string }> = ({
  app, redirectUri, error,
}) => (
  <Layout title="Sign in · NubleStation">
    <AppChip app={app} />
    <h1>Welcome back</h1>
    <p class="sub">Sign in to your NubleStation account.</p>
    {error ? <div class="error">{error}</div> : null}
    <form method="post" action="/login">
      <Hidden app={app} redirectUri={redirectUri} />
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" required autocomplete="current-password" />
      </div>
      <button type="submit">Sign in</button>
    </form>
    <p class="alt">
      New here? <a href={`/register${qs(app, redirectUri)}`}>Create an account</a>
    </p>
  </Layout>
);

export const RegisterPage: FC<{ app?: string; redirectUri?: string; error?: string }> = ({
  app, redirectUri, error,
}) => (
  <Layout title="Create account · NubleStation">
    <AppChip app={app} />
    <h1>Create your account</h1>
    <p class="sub">One account for every app on this network.</p>
    {error ? <div class="error">{error}</div> : null}
    <form method="post" action="/register" enctype="multipart/form-data">
      <Hidden app={app} redirectUri={redirectUri} />

      {/* iOS-style avatar uploader */}
      <div class="avatar-field">
        <label class="avatar-box" for="avatar-input">
          <img id="avatar-preview" src="/assets/identity-avatar-default.jpg" alt="" />
        </label>
        <input id="avatar-input" type="file" name="avatar" accept="image/*" hidden />
        <span class="avatar-hint">Optional — tap to choose a photo</span>
      </div>

      <div class="field">
        <label>Full name</label>
        <input type="text" name="display_name" autocomplete="name" />
      </div>
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autocomplete="email" />
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" required minlength={8} autocomplete="new-password" />
      </div>
      <button type="submit">Create account</button>
    </form>
    <p class="alt">
      Already have an account? <a href={`/login${qs(app, redirectUri)}`}>Sign in</a>
    </p>
    <script>{raw(AVATAR_SCRIPT)}</script>
  </Layout>
);

export const MessagePage: FC<{ title: string; icon: string; heading: string; body: string }> = ({
  title, icon, heading, body,
}) => (
  <Layout title={title}>
    <div class="msg-icon">{icon}</div>
    <h1>{heading}</h1>
    <p class="sub">{body}</p>
  </Layout>
);

// Profile + edit modal interactions (toggle modal, password section, avatar preview)
const PROFILE_SCRIPT = `
  (function(){
    var modal = document.getElementById('edit-modal');
    var openBtn = document.getElementById('edit-open');
    if(openBtn && modal){ openBtn.addEventListener('click', function(){ modal.classList.add('open'); }); }
    document.querySelectorAll('[data-close]').forEach(function(el){
      el.addEventListener('click', function(e){ if(e.target===el){ modal.classList.remove('open'); } });
    });
    var pwBtn = document.getElementById('pw-toggle');
    var pwFields = document.getElementById('pw-fields');
    if(pwBtn && pwFields){ pwBtn.addEventListener('click', function(){ pwFields.classList.toggle('open'); }); }
    var inp = document.getElementById('edit-avatar-input');
    if(inp){ inp.addEventListener('change', function(e){
      var f = e.target.files && e.target.files[0];
      if(f) document.getElementById('edit-avatar-preview').src = URL.createObjectURL(f);
    }); }
  })();
`;

function monthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export interface ProfileApp { name: string; displayName: string; role: string }

export const ProfilePage: FC<{
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  apps: ProfileApp[];
  isAdmin: boolean;
  editError?: string;
}> = ({ email, displayName, avatarUrl, role, createdAt, apps, isAdmin, editError }) => {
  const avatar = avatarUrl ?? "/assets/identity-avatar-default.jpg";
  const name = displayName ?? email.split("@")[0];
  const roleLabel = isAdmin ? "Administrator" : role === "end_user" ? "Member" : role;

  return (
    <Layout title={`${name} · NubleStation`} wide>
      {/* Hero + identity */}
      <div class="cover" />
      <div class="pf-head">
        <img class="pf-avatar" src={avatar} alt="" />
        <h1 class="pf-name">{name}</h1>
        <p class="pf-email">{email}</p>
        <span class={`pf-badge ${isAdmin ? "admin" : "member"}`}>
          <span class="dot" />{roleLabel}
        </span>
      </div>

      {/* Stats */}
      <div class="pf-stats">
        <div class="pf-stat">
          <div class="num">{isAdmin ? "All" : String(apps.length)}</div>
          <div class="lbl">Apps</div>
        </div>
        <div class="pf-stat">
          <div class="num">{isAdmin ? "Admin" : "Member"}</div>
          <div class="lbl">Access</div>
        </div>
        <div class="pf-stat">
          <div class="num">{monthYear(createdAt)}</div>
          <div class="lbl">Joined</div>
        </div>
      </div>

      {/* App access */}
      <div class="pf-section-title">App access</div>
      {isAdmin ? (
        <p class="pf-empty">Administrator — access to every app on the network.</p>
      ) : apps.length === 0 ? (
        <p class="pf-empty">No app access yet. Ask an admin to grant you a role.</p>
      ) : (
        <div class="pf-apps">
          {apps.map((a) => (
            <span class="pf-app">{a.displayName} <span class="role">· {a.role}</span></span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div class="pf-actions">
        <button type="button" id="edit-open" class="btn-outline">Edit profile</button>
        <form method="post" action="/logout" style="margin:0">
          <button type="submit" class="btn-ghost">Sign out</button>
        </form>
      </div>

      {/* Edit modal */}
      <div id="edit-modal" class={`modal-overlay${editError ? " open" : ""}`} data-close>
        <div class="modal">
          <h2>Edit profile</h2>
          {editError ? <div class="error">{editError}</div> : null}
          <form method="post" action="/account" enctype="multipart/form-data">
            <div class="avatar-field">
              <label class="avatar-box" for="edit-avatar-input">
                <img id="edit-avatar-preview" src={avatar} alt="" />
              </label>
              <input id="edit-avatar-input" type="file" name="avatar" accept="image/*" hidden />
              <span class="avatar-hint">Tap to change your photo</span>
            </div>
            <div class="field">
              <label>Full name</label>
              <input type="text" name="display_name" value={displayName ?? ""} autocomplete="name" />
            </div>
            <div class="field">
              <label>Email</label>
              <input type="email" name="email" value={email} required autocomplete="email" />
            </div>

            <button type="button" id="pw-toggle" class="pw-toggle">Change password →</button>
            <div id="pw-fields" class="pw-fields">
              <div class="field">
                <label>Current password</label>
                <input type="password" name="current_password" autocomplete="current-password" />
              </div>
              <div class="field">
                <label>New password</label>
                <input type="password" name="new_password" minlength={8} autocomplete="new-password" />
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn-outline" data-close-cancel onclick="document.getElementById('edit-modal').classList.remove('open')">Cancel</button>
              <button type="submit">Save changes</button>
            </div>
          </form>
        </div>
      </div>

      <script>{raw(PROFILE_SCRIPT)}</script>
    </Layout>
  );
};
