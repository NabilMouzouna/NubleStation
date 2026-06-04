/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";

const STYLES = `
  :root {
    --bg: #f6f7fb; --card: #ffffff; --text: #0f1222; --muted: #6b7280;
    --border: #e6e8ef; --accent: #6d28d9; --accent-hover: #5b21b6;
    --danger: #dc2626; --field: #fbfbfd;
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

export const Layout: FC<PropsWithChildren<{ title: string }>> = ({ title, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
    </head>
    <body>
      <div class="card">
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

export const AccountPage: FC<{
  email: string; displayName: string | null; avatarUrl: string | null;
}> = ({ email, displayName, avatarUrl }) => (
  <Layout title="Your account · NubleStation">
    <h1>You're signed in</h1>
    <p class="sub">This identity works across every app on the network.</p>
    <div class="row">
      <img class="row-avatar" src={avatarUrl ?? "/assets/identity-avatar-default.jpg"} alt="" />
      <div>
        <div style="font-weight:600">{displayName ?? email}</div>
        <div style="color:var(--muted);font-size:13px">{email}</div>
      </div>
    </div>
    <form method="post" action="/logout">
      <button type="submit">Sign out</button>
    </form>
  </Layout>
);
