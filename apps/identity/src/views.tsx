/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from "hono/jsx";

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
    border-radius: 16px; padding: 32px; box-shadow: 0 8px 30px rgba(15,18,34,0.06);
  }
  .brand { display: flex; align-items: center; gap: 8px; margin-bottom: 24px; }
  .brand-dot { width: 22px; height: 22px; border-radius: 7px;
    background: linear-gradient(135deg, #7c3aed, #a78bfa); }
  .brand-name { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
  .brand-sub { color: var(--muted); font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.02em; }
  .sub { color: var(--muted); font-size: 13px; margin: 0 0 22px; }
  label { display: block; font-size: 12.5px; font-weight: 500; margin: 0 0 6px; }
  input[type=text], input[type=email], input[type=password] {
    width: 100%; height: 40px; padding: 0 12px; font-size: 14px; color: var(--text);
    background: var(--field); border: 1px solid var(--border); border-radius: 9px; outline: none;
  }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(109,40,217,0.12); }
  .field { margin-bottom: 16px; }
  .file { font-size: 13px; color: var(--muted); }
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
    display: inline-flex; align-items: center; gap: 6px; background: rgba(109,40,217,0.08);
    color: var(--accent); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 500;
    margin-bottom: 18px;
  }
  .msg-icon { font-size: 34px; margin-bottom: 10px; }
  .row { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border); }
  .muted { color: var(--muted); font-size: 13px; }
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
        <div class="brand">
          <span class="brand-dot" />
          <span class="brand-name">NubleStation</span>
          <span class="brand-sub">· Identity</span>
        </div>
        {children}
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
      <div class="field">
        <label>Profile photo <span class="muted">(optional)</span></label>
        <input class="file" type="file" name="avatar" accept="image/*" />
      </div>
      <button type="submit">Create account</button>
    </form>
    <p class="alt">
      Already have an account? <a href={`/login${qs(app, redirectUri)}`}>Sign in</a>
    </p>
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
      {avatarUrl
        ? <img class="avatar" src={avatarUrl} alt="" />
        : <span class="brand-dot" style="width:44px;height:44px;border-radius:50%" />}
      <div>
        <div style="font-weight:600">{displayName ?? email}</div>
        <div class="muted">{email}</div>
      </div>
    </div>
    <form method="post" action="/logout">
      <button type="submit">Sign out</button>
    </form>
  </Layout>
);
